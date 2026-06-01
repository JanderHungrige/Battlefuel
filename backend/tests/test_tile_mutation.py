"""Tests for tile mutation + the tile_update frame (Wave 4 dynamic-tile-updates)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.domain.tile import (
    Cover,
    IntelLevel,
    RoadCondition,
    TerrainType,
    Tile,
    TileMutation,
    Weather,
)
from app.providers.tiles import DbTileProvider
from app.services.tile_mutation import apply_tile_mutation, tile_update_frame


def _tile(**over: object) -> Tile:
    base: dict[str, object] = dict(
        h3_index="8811aa",
        resolution=8,
        center_lat=49.2,
        center_lon=11.85,
        terrain=TerrainType.FOREST,
        threat_level=2,
        intel_level=IntelLevel.LOW,
        weather=Weather.CLEAR,
        road_condition=RoadCondition.CLEAR,
        cover=Cover.NONE,
        boundary=[],
    )
    base.update(over)
    return Tile(**base)


class TestTileUpdateFrame:
    def test_frame_carries_type_and_attributes_as_plain_values(self) -> None:
        frame = tile_update_frame(_tile(threat_level=4, road_condition=RoadCondition.DAMAGED))
        assert frame["type"] == "tile_update"
        assert frame["h3_index"] == "8811aa"
        assert frame["threat_level"] == 4
        assert frame["road_condition"] == "damaged"
        assert frame["terrain"] == "forest"


@asynccontextmanager
async def _session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(Settings().database_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    try:
        async with maker() as session:
            yield session
    except SQLAlchemyError as exc:
        pytest.skip(f"database unavailable: {exc}")
    finally:
        await engine.dispose()


@pytest.mark.db
class TestApplyTileMutation:
    async def test_mutation_persists_and_returns_updated_tile(self) -> None:
        provider = DbTileProvider()
        async with _session() as session:
            tiles = await provider.list_tiles(session)
            if not tiles:
                pytest.skip("no tiles seeded")
            target = tiles[0]
            original = TileMutation(
                threat_level=target.threat_level, road_condition=target.road_condition
            )
            try:
                updated = await apply_tile_mutation(
                    session,
                    provider,
                    target.h3_index,
                    TileMutation(threat_level=5, road_condition=RoadCondition.DAMAGED),
                )
                assert updated is not None
                assert updated.threat_level == 5
                assert updated.road_condition is RoadCondition.DAMAGED
            finally:
                await provider.update_tile(session, target.h3_index, original)

    async def test_missing_tile_returns_none(self) -> None:
        provider = DbTileProvider()
        async with _session() as session:
            result = await apply_tile_mutation(
                session, provider, "ffffffffffffffff", TileMutation(threat_level=1)
            )
            assert result is None
