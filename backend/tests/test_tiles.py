"""Tests for the hex-tile model, provider, and API (Wave 2 Feature 3)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import h3
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.api.tiles import get_session
from app.config import Settings
from app.domain.theater import HOHENFELS
from app.domain.tile import TerrainType, Tile
from app.main import create_app
from app.providers.tiles import (
    DbTileProvider,
    UnknownTileProviderError,
    build_tile_provider,
)
from app.services.tile_grid import DEFAULT_RESOLUTION, cell_center, generate_cells
from app.services.tile_seed import generate_and_store_tiles

_VALID_TERRAINS = {t.value for t in TerrainType}


class TestGrid:
    def test_generates_cells_over_theater(self) -> None:
        cells = generate_cells(HOHENFELS, DEFAULT_RESOLUTION)
        assert 50 <= len(cells) <= 1000
        assert all(h3.is_valid_cell(c) for c in cells)

    def test_cells_are_unique(self) -> None:
        cells = generate_cells(HOHENFELS)
        assert len(cells) == len(set(cells))

    def test_cell_center_within_bbox(self) -> None:
        b = HOHENFELS.bbox
        for cell in generate_cells(HOHENFELS)[:20]:
            lat, lon = cell_center(cell)
            assert b.south - 0.05 <= lat <= b.north + 0.05
            assert b.west - 0.05 <= lon <= b.east + 0.05

    def test_boundary_is_a_ring_of_lonlat(self) -> None:
        cell = generate_cells(HOHENFELS)[0]
        ring = Tile.boundary_for(cell)
        assert len(ring) >= 6
        assert all(len(pt) == 2 for pt in ring)


class TestFactory:
    def test_builds_db_provider_by_default(self) -> None:
        assert isinstance(build_tile_provider(Settings(tile_provider="db")), DbTileProvider)

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(UnknownTileProviderError, match="nope"):
            build_tile_provider(Settings(tile_provider="nope"))


@asynccontextmanager
async def _seeded_session() -> AsyncIterator[AsyncSession]:
    """Yield a session against a freshly seeded DB, or skip if unreachable."""
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            await generate_and_store_tiles(session)
            yield session
    except SQLAlchemyError as exc:
        pytest.skip(f"database unavailable: {exc}")
    finally:
        await engine.dispose()


@pytest.mark.db
class TestTileProviderDb:
    async def test_lists_tiles(self) -> None:
        async with _seeded_session() as session:
            tiles = await DbTileProvider().list_tiles(session)
            assert len(tiles) > 0
            assert all(t.terrain.value in _VALID_TERRAINS for t in tiles)

    async def test_get_known_tile_and_missing(self) -> None:
        async with _seeded_session() as session:
            some = (await DbTileProvider().list_tiles(session))[0]
            fetched = await DbTileProvider().get_tile(session, some.h3_index)
            assert fetched is not None and fetched.h3_index == some.h3_index
            assert await DbTileProvider().get_tile(session, "8000000000000000") is None

    async def test_bbox_filter_excludes_far_tiles(self) -> None:
        async with _seeded_session() as session:
            far = HOHENFELS.bbox.model_copy(update={"west": -5.0, "east": -4.0})
            assert len(await DbTileProvider().list_tiles(session, far)) == 0


@pytest.mark.db
class TestTilesApi:
    async def _client(self) -> tuple[AsyncClient, object]:
        engine = create_async_engine(Settings().database_url)
        maker = async_sessionmaker(engine, expire_on_commit=False)
        async with maker() as session:
            await generate_and_store_tiles(session)

        async def _override() -> AsyncIterator[AsyncSession]:
            async with maker() as session:
                yield session

        app = create_app()
        app.dependency_overrides[get_session] = _override
        return AsyncClient(transport=ASGITransport(app=app), base_url="http://test"), engine

    async def test_list_and_get(self) -> None:
        try:
            client, engine = await self._client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            resp = await client.get("/api/v1/tiles")
            assert resp.status_code == 200
            body = resp.json()
            assert len(body) > 0
            h3_index = body[0]["h3_index"]
            one = await client.get(f"/api/v1/tiles/{h3_index}")
            assert one.status_code == 200
            assert one.json()["h3_index"] == h3_index
            assert len(one.json()["boundary"]) >= 6
        finally:
            await client.aclose()
            await engine.dispose()

    async def test_404_and_422(self) -> None:
        try:
            client, engine = await self._client()
        except SQLAlchemyError as exc:
            pytest.skip(f"database unavailable: {exc}")
        try:
            assert (await client.get("/api/v1/tiles/not-a-cell")).status_code == 404
            assert (await client.get("/api/v1/tiles", params={"bbox": "1,2,3"})).status_code == 422
        finally:
            await client.aclose()
            await engine.dispose()
