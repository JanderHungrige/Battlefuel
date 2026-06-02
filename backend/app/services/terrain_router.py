"""Off-road (by-foot) terrain router — pure A* over the H3 grid (v2 Wave 1, terrain-router).

A cross-country path-finder that complements the road router. Nodes are H3 hexes, edges connect
adjacent hexes (`h3.grid_disk(cell, 1)`), and the step cost is the Wave-4 **terrain** time-proxy
(`edge_time_cost`) — threat-weighted (`safe_edge_cost`) for the SAFE metric. Road condition is
*ignored*: the unit is not on roads, so off-road movement is always passable (terrain speed
factors are in [0.5, 1.0], never 0). Emits the same `RoutePath` shape the road provider returns,
so the planner and sim consume it unchanged.

No I/O: the caller (`TerrainRoutingProvider`) loads the theater tiles and passes them in, which
keeps this module deterministically unit-testable with a hand-built tile map.
"""

from __future__ import annotations

import heapq
from collections.abc import Iterator, Mapping
from itertools import pairwise

import h3

from app.domain.route import RouteMetric, RoutePath
from app.domain.tile import TerrainType
from app.services.cost_model import (
    TERRAIN_FUEL,
    TERRAIN_SPEED,
    TileFactors,
    edge_time_cost,
    safe_edge_cost,
)
from app.services.sim import haversine_m
from app.services.tile_grid import DEFAULT_RESOLUTION

# A theater cell: its terrain type and current threat level. (road_condition is irrelevant off-road)
TileInfo = tuple[TerrainType, int]
TileMap = Mapping[str, TileInfo]


def _terrain_factors(terrain: TerrainType) -> TileFactors:
    """Off-road factors: terrain only, no road-condition multiplier (the unit is off the roads)."""
    return TileFactors(
        speed_factor=TERRAIN_SPEED.get(terrain, 1.0),
        fuel_factor=TERRAIN_FUEL.get(terrain, 1.0),
    )


def _lonlat(cell: str) -> list[float]:
    """Hex center as a GeoJSON [lon, lat] pair (H3 yields lat, lng)."""
    lat, lon = h3.cell_to_latlng(cell)
    return [lon, lat]


def _nearest_cell(tiles: TileMap, lat: float, lon: float) -> str:
    """The theater cell containing (lat, lon), or the nearest one by center distance."""
    cell: str = h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION)
    if cell in tiles:
        return cell
    return min(tiles, key=lambda c: haversine_m(_lonlat(c)[0], _lonlat(c)[1], lon, lat))


def _neighbors(tiles: TileMap, cell: str) -> Iterator[str]:
    for n in h3.grid_disk(cell, 1):
        if n != cell and n in tiles:
            yield n


def _step_cost(tiles: TileMap, frm: str, to: str, metric: RouteMetric) -> float:
    """Search cost of stepping into ``to``: terrain time-proxy, threat-weighted when SAFE."""
    a, b = _lonlat(frm), _lonlat(to)
    terrain, threat = tiles[to]
    time_cost = edge_time_cost(haversine_m(a[0], a[1], b[0], b[1]), _terrain_factors(terrain))
    if metric is RouteMetric.SAFE:
        return safe_edge_cost(time_cost, threat)
    return time_cost


def _a_star(tiles: TileMap, start: str, dest: str, metric: RouteMetric) -> list[str] | None:
    """A* from ``start`` to ``dest``; admissible straight-line heuristic. None if unreachable."""
    dest_c = _lonlat(dest)

    def heuristic(cell: str) -> float:
        c = _lonlat(cell)
        return haversine_m(c[0], c[1], dest_c[0], dest_c[1])

    frontier: list[tuple[float, int, str]] = [(heuristic(start), 0, start)]
    came_from: dict[str, str | None] = {start: None}
    cost_so_far: dict[str, float] = {start: 0.0}
    counter = 1
    while frontier:
        _, _, current = heapq.heappop(frontier)
        if current == dest:
            break
        for nxt in _neighbors(tiles, current):
            new_cost = cost_so_far[current] + _step_cost(tiles, current, nxt, metric)
            if nxt not in cost_so_far or new_cost < cost_so_far[nxt]:
                cost_so_far[nxt] = new_cost
                came_from[nxt] = current
                heapq.heappush(frontier, (new_cost + heuristic(nxt), counter, nxt))
                counter += 1
    if dest not in came_from:
        return None
    path: list[str] = []
    node: str | None = dest
    while node is not None:
        path.append(node)
        node = came_from[node]
    path.reverse()
    return path


def terrain_path(
    tiles: TileMap,
    start_lat: float,
    start_lon: float,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
) -> RoutePath | None:
    """Off-road path over the H3 grid as a `RoutePath`, or None if start/dest are the same cell."""
    if not tiles:
        return None
    start = _nearest_cell(tiles, start_lat, start_lon)
    dest = _nearest_cell(tiles, dest_lat, dest_lon)
    if start == dest:
        return None
    path = _a_star(tiles, start, dest, metric)
    if path is None or len(path) < 2:
        return None

    distance_m = effective_m = fuel_m = 0.0
    for frm, to in pairwise(path):
        a, b = _lonlat(frm), _lonlat(to)
        terrain, _threat = tiles[to]
        factors = _terrain_factors(terrain)
        step_d = haversine_m(a[0], a[1], b[0], b[1])
        step_t = edge_time_cost(step_d, factors)
        distance_m += step_d
        effective_m += step_t
        fuel_m += factors.fuel_factor * step_t
    threats = [tiles[c][1] for c in path]
    return RoutePath(
        metric=metric,
        geometry=[_lonlat(c) for c in path],
        distance_m=distance_m,
        effective_distance_m=effective_m,
        fuel_distance_m=fuel_m,
        threat_max=max(threats),
        threat_avg=sum(threats) / len(threats),
        degraded=False,
    )
