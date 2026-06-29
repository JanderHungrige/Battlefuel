"""Tests for the routing graph + provider (Wave 3 Feature 1: routing-graph)."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings
from app.domain.route import RouteMetric, RouteMode, RoutePath
from app.providers.routing import (
    PgRoutingProvider,
    TerrainRoutingProvider,
    UnknownRoutingProviderError,
    _coords_from_geojson,
    build_routing_provider,
    build_routing_provider_for_mode,
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

    def test_mode_selects_road_vs_terrain_provider(self) -> None:
        road = build_routing_provider_for_mode(RouteMode.ROAD)
        offroad = build_routing_provider_for_mode(RouteMode.OFFROAD)
        assert isinstance(road, PgRoutingProvider)
        assert isinstance(offroad, TerrainRoutingProvider)


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
class TestHybridRouteStitch:
    """v2 Wave 19 F1 (road-geometry stitch): the hybrid route draws road runs with the real ways
    geometry (so it hugs streets) and the cost matches the drawn line."""

    async def test_hybrid_route_hugs_roads_and_cost_matches_geometry(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            prov = build_routing_provider_for_mode(RouteMode.HYBRID)
            path = await prov.shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None
            # Real road geometry stitched in → many points, not a handful of hex centres.
            assert len(path.geometry) > 20
            # stitch_paths summed the legs, so distance matches the drawn polyline.
            glen = sum(
                haversine_m(
                    path.geometry[k][0], path.geometry[k][1],
                    path.geometry[k + 1][0], path.geometry[k + 1][1],
                )
                for k in range(len(path.geometry) - 1)
            )
            assert path.distance_m == pytest.approx(glen, rel=0.05)
            # Endpoints anchored exactly at the unit and the destination.
            assert path.geometry[0] == pytest.approx([_A[1], _A[0]], abs=1e-6)
            assert path.geometry[-1] == pytest.approx([_B[1], _B[0]], abs=1e-6)


@pytest.mark.db
class TestNearestPointSnapAndStubs:
    """v2 Wave 18 F1+F2: route snaps to the nearest POINT on the nearest road (not a far vertex)
    and draws straight stubs from the unit to that point and from the road exit to the target."""

    async def test_offroad_endpoints_get_road_snap_points_and_stubs(self) -> None:
        async with _session() as session:
            await _require_graph(session)
            # _A and _B are both off the road network (~120-160 m away).
            path = await PgRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None
            # F1: the true nearest road points are reported for both ends.
            assert path.road_entry is not None and path.road_exit is not None
            # F2: geometry begins exactly at the unit and ends exactly at the destination.
            assert path.geometry[0] == pytest.approx([_A[1], _A[0]], abs=1e-6)
            assert path.geometry[-1] == pytest.approx([_B[1], _B[0]], abs=1e-6)
            # The road join point differs from the unit (there is a real off-road stub here).
            assert path.road_entry != path.geometry[0]
            # Total distance exceeds the straight-line distance (stub + road).
            straight = haversine_m(_A[1], _A[0], _B[1], _B[0])
            assert path.distance_m >= straight
            # Option 3: the off-road stubs are priced above road rate, so the time-proxy
            # (effective) exceeds the raw distance.
            assert path.effective_distance_m > path.distance_m

    async def _build_with(self, session: AsyncSession, selector: object) -> object:
        """Run an endpoint selector (_NEAREST_SQL / _CHOOSE_SQL) then the geometry query, returning
        the geometry row — lets tests compare the two selection strategies head to head."""
        from app.providers.routing import _BLOCKED_COST, _WITHPOINTS_SQL, _primary_edges
        from app.services.cost_model import OFFROAD_FUEL_PENALTY, OFFROAD_STUB_SPEED_FACTOR

        base = {
            "slon": _A[1], "slat": _A[0], "dlon": _B[1], "dlat": _B[0],
            "blocked": _BLOCKED_COST, "edges": _primary_edges(RouteMetric.FAST),
            "stub_speed": OFFROAD_STUB_SPEED_FACTOR, "fuel_pen": OFFROAD_FUEL_PENALTY,
        }
        sel = (await session.execute(selector, base)).first()  # type: ignore[arg-type]
        assert sel is not None
        gp = {
            **base, "se_gid": sel.se_gid, "se_frac": float(sel.se_frac),
            "de_gid": sel.de_gid, "de_frac": float(sel.de_frac),
        }
        return (await session.execute(_WITHPOINTS_SQL, gp)).one()

    async def test_nearest_selector_uses_true_metres_not_degrees(self) -> None:
        # Option 1: the nearest selector ranks by TRUE metres. _B's nearest road is ~92 m away; the
        # old planar-degree ordering wrongly picked a ~124 m edge (degrees are anisotropic at 49°N).
        from app.providers.routing import _NEAREST_SQL, _point_from_geojson

        async with _session() as session:
            await _require_graph(session)
            row = await self._build_with(session, _NEAREST_SQL)
            exit_pt = _point_from_geojson(row.exit_pt)  # type: ignore[attr-defined]
            assert exit_pt is not None
            snap_m = haversine_m(exit_pt[0], exit_pt[1], _B[1], _B[0])
            assert snap_m < 110  # ~92 m (true nearest); the planar bug would give ~124 m

    async def test_route_cost_pick_is_never_longer_than_nearest(self) -> None:
        # Option 2: choosing the lowest-total-cost candidate pair never yields a longer total route
        # than the plain nearest snap (it trades a slightly farther snap for a shorter road).
        from app.providers.routing import _CHOOSE_SQL, _NEAREST_SQL

        async with _session() as session:
            await _require_graph(session)
            route_cost = await self._build_with(session, _CHOOSE_SQL)
            nearest = await self._build_with(session, _NEAREST_SQL)
            assert route_cost.distance_m <= nearest.distance_m + 1.0  # type: ignore[attr-defined]


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


@pytest.mark.db
class TestTerrainProvider:
    """The off-road terrain router routes over the H3 tile grid (no `ways` graph)."""

    async def test_offroad_route_resolves_over_the_theater(self) -> None:
        async with _session() as session:
            tiles = (await session.execute(text("SELECT count(*) FROM tiles"))).scalar_one()
            if not tiles:
                pytest.skip("no tiles — run scripts/generate_tiles.py")
            path = await TerrainRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None
            assert path.degraded is False
            assert len(path.geometry) >= 2
            assert path.distance_m > 0
            assert all(len(pt) == 2 for pt in path.geometry)

    async def test_offroad_ignores_blocked_roads(self) -> None:
        # Off-road movement is not on roads, so even a fully road-blocked theater still routes.
        async with _session() as session:
            tiles = (await session.execute(text("SELECT count(*) FROM tiles"))).scalar_one()
            if not tiles:
                pytest.skip("no tiles — run scripts/generate_tiles.py")
            await session.execute(text("UPDATE ways SET time_cost = 1e12, safe_cost = 1e12"))
            path = await TerrainRoutingProvider().shortest_path(session, *_A, *_B, RouteMetric.FAST)
            assert path is not None  # terrain router does not consult `ways` at all
            await session.rollback()
