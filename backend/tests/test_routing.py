"""Tests for the routing graph + provider (Wave 3 Feature 1: routing-graph)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.domain.route import RouteMetric, RoutePath
from app.providers.routing import (
    PgRoutingProvider,
    UnknownRoutingProviderError,
    _coords_from_geojson,
    build_routing_provider,
)

# Two points inside the Hohenfels theater, ~5 km apart on the road network.
_A = (49.20, 11.83)
_B = (49.23, 11.86)


class TestGeoJsonParsing:
    def test_linestring(self) -> None:
        gj = '{"type":"LineString","coordinates":[[11.8,49.2],[11.81,49.21]]}'
        assert _coords_from_geojson(gj) == [[11.8, 49.2], [11.81, 49.21]]

    def test_multilinestring_is_flattened(self) -> None:
        gj = '{"type":"MultiLineString","coordinates":[[[1,2],[3,4]],[[5,6]]]}'
        assert _coords_from_geojson(gj) == [[1, 2], [3, 4], [5, 6]]

    def test_none_and_empty(self) -> None:
        assert _coords_from_geojson(None) == []
        assert _coords_from_geojson('{"type":"Point","coordinates":[1,2]}') == []


class TestFactory:
    def test_builds_pgrouting_provider(self) -> None:
        assert isinstance(
            build_routing_provider(Settings(routing_provider="pgrouting")), PgRoutingProvider
        )

    def test_unknown_provider_raises(self) -> None:
        with pytest.raises(UnknownRoutingProviderError):
            build_routing_provider(Settings(routing_provider="nope"))


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


async def _require_graph(session: AsyncSession) -> None:
    try:
        ways = (await session.execute(text("SELECT count(*) FROM ways"))).scalar_one()
    except SQLAlchemyError:
        pytest.skip("ways table missing — run backend/scripts/build_routing_graph.sh")
    if not ways:
        pytest.skip("routing graph empty — run backend/scripts/build_routing_graph.sh")


@pytest.mark.db
class TestPgRouting:
    async def test_fast_route_between_two_points(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            path = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None
            assert path.metric is RouteMetric.FAST
            assert len(path.geometry) >= 2
            assert path.distance_m > 0
            assert all(len(pt) == 2 for pt in path.geometry)

    async def test_safe_route_is_never_shorter_than_fast(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            fast = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            safe = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.SAFE)
            assert fast is not None and safe is not None
            # Safe minimizes threat-weighted distance, so its raw distance is >= fastest.
            assert safe.distance_m >= fast.distance_m - 1.0

    async def test_same_start_and_dest_has_no_path(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            path = await PgRoutingProvider().shortest_path(session, *_A, *_A, RouteMetric.FAST)
            assert path is None

    async def test_returns_a_routepath_instance(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            path = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.SAFE)
            assert isinstance(path, RoutePath)
