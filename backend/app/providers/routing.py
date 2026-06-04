"""Routing providers and factory (Wave 3, routing-graph; v2 Wave 1, routing-bug-fix).

Wraps pgRouting: snaps start/destination to the nearest graph vertices and runs
`pgr_dijkstra` over the `ways` edges, minimizing either distance (`fast`) or the
threat-weighted `safe_cost` (`safe`). Returns a `RoutePath` (geometry + distance + threat).

Two reliability guarantees added in v2 Wave 1 (see `.mdd/docs/43-routing-bug-fix.md`):

* **Always resolve.** If the primary (blocked-aware) metric graph has no path — e.g. the sim has
  blocked enough tiles to disconnect it — the router falls back to the *full* graph minimizing
  real distance (manual obstacles still excluded), so a route is returned whenever one
  geometrically exists. Fallback routes are flagged ``degraded`` and logged.
* **Travel-ordered geometry.** Each path edge is oriented to its traversal direction (comparing
  ``ways.source`` to the dijkstra node) and concatenated with ``ST_MakeLine(... ORDER BY seq)``,
  so the geometry always runs start → destination — never a flipped/zig-zagged ``ST_LineMerge``.
"""

from __future__ import annotations

import json
import logging
from abc import ABC, abstractmethod
from collections.abc import Callable, Mapping
from typing import Any

from sqlalchemy import Row, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.route import RouteMetric, RouteMode, RoutePath

logger = logging.getLogger(__name__)

# Cost / reverse-cost columns per metric (roads treated as bidirectional for the game).
# FAST minimizes the terrain-aware time-proxy cost; SAFE the threat-weighted safe cost.
_COST_COLUMN = {RouteMetric.FAST: "time_cost", RouteMetric.SAFE: "safe_cost"}
_RCOST_COLUMN = {RouteMetric.FAST: "time_reverse_cost", RouteMetric.SAFE: "safe_reverse_cost"}
# Edges at/above this cost are impassable (blocked roads) and excluded from the primary graph.
_BLOCKED_COST = 1.0e12

# Manual operator obstacles are absolute — excluded from both the primary and the fallback graph.
_OBSTACLE_FILTER = "(cell_h3 IS NULL OR cell_h3 NOT IN (SELECT h3_index FROM obstacles))"

# Snap start/dest to nearest vertices, run pgr_dijkstra, then build the result. Each path edge is
# oriented to the traversal direction and ST_MakeLine(ORDER BY seq) yields one travel-ordered
# start→dest LineString. A blocked edge's sentinel time_cost is clamped to its real length so a
# degraded route (which may traverse blocked roads) still reports a sane duration/fuel estimate.
_PATH_SQL = text(
    """
    WITH src AS (
        SELECT id FROM ways_vertices_pgr
        ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(:slon, :slat), 4326) LIMIT 1
    ),
    dst AS (
        SELECT id FROM ways_vertices_pgr
        ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(:dlon, :dlat), 4326) LIMIT 1
    ),
    path AS (
        SELECT seq, node, edge FROM pgr_dijkstra(
            :edges, (SELECT id FROM src), (SELECT id FROM dst), directed := true
        ) WHERE edge <> -1
    ),
    seg AS (
        SELECT
            p.seq,
            CASE WHEN w.source = p.node THEN w.the_geom ELSE ST_Reverse(w.the_geom) END AS geom,
            COALESCE(w.length_m, 0) AS length_m,
            CASE WHEN COALESCE(w.time_cost, w.length_m) >= :blocked
                 THEN COALESCE(w.length_m, 0)
                 ELSE COALESCE(w.time_cost, w.length_m) END AS eff_m,
            COALESCE(w.fuel_factor, 1.0) AS fuel_factor,
            COALESCE(w.threat_level, 0) AS threat_level
        FROM path p JOIN ways w ON w.gid = p.edge
    )
    SELECT
        ST_AsGeoJSON(ST_MakeLine(geom ORDER BY seq)) AS geom,
        COALESCE(SUM(length_m), 0) AS distance_m,
        COALESCE(SUM(eff_m), 0) AS effective_distance_m,
        COALESCE(SUM(fuel_factor * eff_m), 0) AS fuel_distance_m,
        COALESCE(MAX(threat_level), 0) AS threat_max,
        COALESCE(AVG(threat_level), 0)::float AS threat_avg
    FROM seg
    """
)


def _primary_edges(metric: RouteMetric) -> str:
    """Edge SQL for the metric graph: blocked roads and manual-obstacle cells excluded."""
    return (
        f"SELECT gid AS id, source, target, {_COST_COLUMN[metric]} AS cost, "
        f"{_RCOST_COLUMN[metric]} AS reverse_cost FROM ways "
        f"WHERE COALESCE(time_cost, length_m) < {_BLOCKED_COST} AND {_OBSTACLE_FILTER}"
    )


# Fallback edge SQL: the full graph by real distance — includes otherwise-blocked roads as a last
# resort, but never manual obstacles. Guarantees a route whenever start/dest are connected.
_FALLBACK_EDGES = (
    "SELECT gid AS id, source, target, length_m AS cost, length_m AS reverse_cost "
    f"FROM ways WHERE {_OBSTACLE_FILTER}"
)


def _coords_from_geojson(geom: str | None) -> list[list[float]]:
    if not geom:
        return []
    data = json.loads(geom)
    if data["type"] == "LineString":
        return [list(p) for p in data["coordinates"]]
    if data["type"] == "MultiLineString":
        return [list(p) for line in data["coordinates"] for p in line]
    return []


class RoutingProvider(ABC):
    @abstractmethod
    async def shortest_path(
        self,
        session: AsyncSession,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        metric: RouteMetric,
    ) -> RoutePath | None:
        """Return the best path for ``metric``, or ``None`` if start/dest can't be connected."""


class PgRoutingProvider(RoutingProvider):
    async def shortest_path(
        self,
        session: AsyncSession,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        metric: RouteMetric,
    ) -> RoutePath | None:
        params = {
            "slon": start_lon,
            "slat": start_lat,
            "dlon": dest_lon,
            "dlat": dest_lat,
            "blocked": _BLOCKED_COST,
        }
        # 1) Primary: minimize the metric cost over the blocked-/obstacle-aware graph.
        row = await self._run(session, params, _primary_edges(metric))
        coords = _coords_from_geojson(row.geom)
        degraded = False
        if not coords:
            # 2) Fallback: the metric graph is disconnected (e.g. sim-blocked tiles). Route over
            #    the full graph by real distance so a path is still returned when one exists.
            row = await self._run(session, params, _FALLBACK_EDGES)
            coords = _coords_from_geojson(row.geom)
            if not coords:
                return None
            degraded = True
            logger.warning(
                "routing: no %s path %.5f,%.5f -> %.5f,%.5f on the primary graph; "
                "returning a degraded distance-only fallback route",
                metric.value,
                start_lat,
                start_lon,
                dest_lat,
                dest_lon,
            )
        return RoutePath(
            metric=metric,
            geometry=coords,
            distance_m=float(row.distance_m),
            effective_distance_m=float(row.effective_distance_m),
            fuel_distance_m=float(row.fuel_distance_m),
            threat_max=int(row.threat_max),
            threat_avg=float(row.threat_avg),
            degraded=degraded,
        )

    async def _run(
        self, session: AsyncSession, params: Mapping[str, object], edges_sql: str
    ) -> Row[Any]:
        """Run the snap → dijkstra → build query for one edge set; returns the single result row."""
        return (await session.execute(_PATH_SQL, {**params, "edges": edges_sql})).one()


class TerrainRoutingProvider(RoutingProvider):
    """Off-road (by-foot) router: A* over the H3 terrain grid (v2 Wave 1, terrain-router).

    Loads the theater tiles via the tile factory and delegates to the pure ``terrain_path``
    A*. Ignores the road graph entirely, so it routes cross-country even when every road is
    blocked. Returns the same ``RoutePath`` shape as the road provider.
    """

    async def shortest_path(
        self,
        session: AsyncSession,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        metric: RouteMetric,
    ) -> RoutePath | None:
        # Imported lazily to avoid a provider/service import cycle at module load.
        from app.providers.tiles import build_tile_provider
        from app.services.terrain_router import terrain_path

        tiles = await build_tile_provider().list_tiles(session)
        tile_map = {t.h3_index: (t.terrain, t.threat_level) for t in tiles}
        return terrain_path(tile_map, start_lat, start_lon, dest_lat, dest_lon, metric)


class DirectRoutingProvider(RoutingProvider):
    """Direct (near-straight) cross-country router (v2 Wave 10, hybrid-direct-routing-modes).

    Walks the H3 grid line from start to destination over the terrain grid — follows the
    landscape's terrain cost but does not avoid threat or obstacles. Same ``RoutePath`` shape.
    """

    async def shortest_path(
        self,
        session: AsyncSession,
        start_lat: float,
        start_lon: float,
        dest_lat: float,
        dest_lon: float,
        metric: RouteMetric,
    ) -> RoutePath | None:
        from app.providers.tiles import build_tile_provider
        from app.services.terrain_router import direct_path

        tiles = await build_tile_provider().list_tiles(session)
        tile_map = {t.h3_index: (t.terrain, t.threat_level) for t in tiles}
        return direct_path(tile_map, start_lat, start_lon, dest_lat, dest_lon, metric)


RoutingProviderBuilder = Callable[[], RoutingProvider]
_REGISTRY: dict[str, RoutingProviderBuilder] = {}


class UnknownRoutingProviderError(ValueError):
    """Raised when config names a routing provider that is not registered."""


def register_routing_provider(name: str, builder: RoutingProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_routing_provider(settings: Settings | None = None) -> RoutingProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.routing_provider]
    except KeyError as exc:
        raise UnknownRoutingProviderError(
            f"unknown routing provider {settings.routing_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_routing_provider("pgrouting", PgRoutingProvider)
register_routing_provider("terrain", TerrainRoutingProvider)
register_routing_provider("direct", DirectRoutingProvider)


def build_routing_provider_for_mode(
    mode: RouteMode, settings: Settings | None = None
) -> RoutingProvider:
    """Select the router for a travel mode: ``offroad`` → terrain A*, ``direct`` → straight
    cross-country line, anything else → the configured road provider (pgRouting). ``hybrid`` is
    composed in the planner from the road + off-road providers, so it is not a single provider."""
    if mode is RouteMode.OFFROAD:
        return _REGISTRY["terrain"]()
    if mode is RouteMode.DIRECT:
        return _REGISTRY["direct"]()
    return build_routing_provider(settings)
