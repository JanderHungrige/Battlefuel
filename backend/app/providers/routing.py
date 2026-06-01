"""Routing providers and factory (Wave 3, routing-graph).

Wraps pgRouting: snaps start/destination to the nearest graph vertices and runs
`pgr_dijkstra` over the `ways` edges, minimizing either distance (`fast`) or the
threat-weighted `safe_cost` (`safe`). Returns a `RoutePath` (geometry + distance + threat).
"""

from __future__ import annotations

import json
from abc import ABC, abstractmethod
from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.route import RouteMetric, RoutePath

# Cost / reverse-cost columns per metric (roads treated as bidirectional for the game).
_COST_COLUMN = {RouteMetric.FAST: "length_m", RouteMetric.SAFE: "safe_cost"}
_RCOST_COLUMN = {RouteMetric.FAST: "length_m", RouteMetric.SAFE: "safe_reverse_cost"}


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
        edges_sql = (
            f"SELECT gid AS id, source, target, {_COST_COLUMN[metric]} AS cost, "
            f"{_RCOST_COLUMN[metric]} AS reverse_cost FROM ways"
        )
        query = text(
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
                SELECT * FROM pgr_dijkstra(
                    :edges, (SELECT id FROM src), (SELECT id FROM dst), directed := true
                )
            )
            SELECT
                ST_AsGeoJSON(ST_LineMerge(ST_Collect(w.the_geom ORDER BY p.seq))) AS geom,
                COALESCE(SUM(w.length_m), 0) AS distance_m,
                COALESCE(MAX(w.threat_level), 0) AS threat_max,
                COALESCE(AVG(w.threat_level), 0)::float AS threat_avg
            FROM path p JOIN ways w ON w.gid = p.edge
            WHERE p.edge <> -1
            """
        )
        row = (
            await session.execute(
                query,
                {
                    "slon": start_lon,
                    "slat": start_lat,
                    "dlon": dest_lon,
                    "dlat": dest_lat,
                    "edges": edges_sql,
                },
            )
        ).one()
        coords = _coords_from_geojson(row.geom)
        if not coords:
            return None
        return RoutePath(
            metric=metric,
            geometry=coords,
            distance_m=float(row.distance_m),
            threat_max=int(row.threat_max),
            threat_avg=float(row.threat_avg),
        )


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
