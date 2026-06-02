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
from app.services.sim import haversine_m

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


@pytest.mark.db
class TestResolveAlways:
    """Regression for the live 'never a route to that destination' bug (v2 Wave 1).

    When the sim blocks enough tiles, every edge gets the impassable sentinel cost and is
    excluded from the metric graph, so ``pgr_dijkstra`` finds nothing even though the road
    network still physically connects start and destination. The provider must fall back to
    the full graph (real distance) and still return a route, flagged ``degraded``.
    """

    async def test_falls_back_to_full_graph_when_metric_graph_disconnected(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            # In-session only (rolled back below): make the entire metric graph impassable,
            # exactly as a fully sim-polluted theater would.
            await session.execute(
                text(
                    "UPDATE ways SET time_cost = 1e12, time_reverse_cost = 1e12, "
                    "safe_cost = 1e12, safe_reverse_cost = 1e12"
                )
            )
            # The primary (blocked-aware) edge set is now empty → would be 'no route'.
            primary_edges = (
                await session.execute(
                    text("SELECT count(*) FROM ways WHERE COALESCE(time_cost, length_m) < 1e12")
                )
            ).scalar_one()
            assert primary_edges == 0

            path = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None  # fallback resolved a route the primary graph could not
            assert path.degraded is True
            assert len(path.geometry) >= 2
            assert path.distance_m > 0
            await session.rollback()

    async def test_primary_route_is_not_degraded(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            # In-session: a clean, fully passable graph (no blocks) → primary must resolve.
            await session.execute(
                text(
                    "UPDATE ways SET time_cost = length_m, time_reverse_cost = length_m, "
                    "safe_cost = length_m, safe_reverse_cost = length_m"
                )
            )
            path = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None
            assert path.degraded is False
            await session.rollback()


@pytest.mark.db
class TestRouteOrientation:
    """Regression for the live 'unit reverses / goes back-and-forth' bug (v2 Wave 1).

    The geometry must run start → destination in travel order: ``geometry[0]`` nearest the
    unit's start, ``geometry[-1]`` nearest the destination. The old ``ST_LineMerge(ST_Collect())``
    did not guarantee this and could flip or zig-zag the line.
    """

    async def test_geometry_runs_from_start_to_destination(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            path = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None
            first, last = path.geometry[0], path.geometry[-1]
            start_lon, start_lat = _A[1], _A[0]  # _A is (lat, lon); geometry is [lon, lat]
            dest_lon, dest_lat = _B[1], _B[0]
            # First point is nearer the start than the last point is.
            assert haversine_m(first[0], first[1], start_lon, start_lat) < haversine_m(
                last[0], last[1], start_lon, start_lat
            )
            # Last point is nearer the destination than the first point is.
            assert haversine_m(last[0], last[1], dest_lon, dest_lat) < haversine_m(
                first[0], first[1], dest_lon, dest_lat
            )
            await session.rollback()
