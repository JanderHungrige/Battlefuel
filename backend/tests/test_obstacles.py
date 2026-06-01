"""Tests for manual obstacles (Wave 4 manual-obstacles)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import h3
import pytest
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.domain.obstacle import ObstacleCreate
from app.domain.route import RouteMetric
from app.providers.obstacles import DbObstacleProvider
from app.providers.routing import build_routing_provider
from app.services.tile_grid import DEFAULT_RESOLUTION


class TestObstacleCreate:
    def test_defaults_kind_to_manual(self) -> None:
        assert ObstacleCreate(lat=49.2, lon=11.85).kind == "manual"

    def test_rejects_out_of_range_lat(self) -> None:
        with pytest.raises(ValidationError):
            ObstacleCreate(lat=200.0, lon=11.85)

    def test_rejects_unknown_field(self) -> None:
        with pytest.raises(ValidationError):
            ObstacleCreate(lat=49.2, lon=11.85, h3_index="x")  # type: ignore[call-arg]


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
class TestObstaclesDb:
    async def test_create_list_delete(self) -> None:
        provider = DbObstacleProvider()
        async with _session() as session:
            try:
                cell = h3.latlng_to_cell(49.225, 11.851, DEFAULT_RESOLUTION)
                obstacle = await provider.create(session, cell, "manual")
                assert obstacle.h3_index == cell
                listed = await provider.list_all(session)
                assert any(o.id == obstacle.id for o in listed)
                assert await provider.delete(session, obstacle.id) is True
                remaining = await provider.list_all(session)
                assert all(o.id != obstacle.id for o in remaining)
            finally:
                await provider.delete(session, obstacle.id)

    async def test_obstacles_reroute_or_block(self) -> None:
        provider = DbObstacleProvider()
        routing = build_routing_provider()
        async with _session() as session:
            if not (await session.execute(text("SELECT count(*) FROM ways"))).scalar_one():
                pytest.skip("routing graph empty")
            base = await routing.shortest_path(
                session, 49.232, 11.862, 49.20, 11.83, RouteMetric.FAST
            )
            if base is None:
                pytest.skip("no baseline route in this theater")
            # Block every cell the baseline route passes through.
            cells = {h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION) for lon, lat in base.geometry}
            created = [await provider.create(session, c, "test") for c in cells]
            try:
                blocked = await routing.shortest_path(
                    session, 49.232, 11.862, 49.20, 11.83, RouteMetric.FAST
                )
                # With the whole corridor blocked, routing must avoid it (different path) or fail.
                assert blocked is None or blocked.geometry != base.geometry
            finally:
                for o in created:
                    await provider.delete(session, o.id)
