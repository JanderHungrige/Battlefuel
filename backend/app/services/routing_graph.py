"""Annotate the osm2pgrouting `ways` table with game data (Wave 3 routing-graph; Wave 4
tile-cost-model; v2 Wave 21 multi-resolution threat).

osm2pgrouting builds `ways` (edges) with `length_m`, `source`, `target`, `the_geom`. We add,
per edge: `speed_factor`/`fuel_factor` (terrain x road_condition, from the tile containing the
edge midpoint), a terrain-aware `time_cost` (the FAST metric), and a threat-weighted `safe_cost`
(the SAFE metric). The cost model (`services.cost_model`) is the single source of truth, shared
with the planner and the sim.

**Threat is read at the right resolution (v2 Wave 21, threat-edge-penalty-by-resolution):** an
edge's threat is `threat_grid.threat_at(midpoint)` — the highest-wins level over every threat
whose grid-code footprint covers the midpoint — not the single tile threat at one fixed H3
resolution. So an edge crossing a 500 m level-4 patch gets level 4; an edge in the surrounding
2 km level-2 area gets level 2. This reads the SAME footprint field the map colours, so cost and
colour agree. Footprints use UTM (`EPSG:32632`, zone 32N) to match the drawn MGRS grid.
"""

from __future__ import annotations

from collections.abc import Sequence

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.enemy_unit import EnemyUnit
from app.domain.tile import RoadCondition, TerrainType
from app.providers.enemy_units import build_enemy_unit_provider
from app.services.cost_model import edge_time_cost, safe_edge_cost, tile_factors
from app.services.enemy_danger import enemy_threat_at
from app.services.threat_grid import DEFAULT_THREAT_PRECISION_M, LocatedThreat, threat_at
from app.services.tile_grid import DEFAULT_RESOLUTION

# UTM zone 32N (Hohenfels) — the projected CRS whose metre lattice the MGRS grid snaps to, so a
# threat's footprint square lines up between the map colour and the routing cost.
_UTM_SRID = 32632

# When a single tile's threat changes, re-cost edges whose midpoint lies within this radius (m) of
# the tile centre. Covers the largest threat footprint (≤ 2 km grid code, ~2.8 km corner-to-corner)
# plus a margin, so a footprint that grew/shrank/moved on the change is fully re-evaluated.
RECOST_RADIUS_M = 3000.0

_NEW_COLUMNS = (
    "speed_factor double precision NOT NULL DEFAULT 1.0",
    "fuel_factor double precision NOT NULL DEFAULT 1.0",
    "time_cost double precision",
    "time_reverse_cost double precision",
    "threat_level integer NOT NULL DEFAULT 0",
    "safe_cost double precision",
    "safe_reverse_cost double precision",
    "cell_h3 text",  # H3 cell of the edge midpoint — terrain/road lookup + targeted re-annotation
)

_UPDATE_SQL = (
    "UPDATE ways SET speed_factor = :sf, fuel_factor = :ff, time_cost = :tc, "
    "time_reverse_cost = :tc, threat_level = :t, safe_cost = :s, safe_reverse_cost = :s "
    "WHERE gid = :g"
)

# Edge midpoint as lat/lon (4326, for the H3 cell + enemy proximity) AND UTM x/y (32632, for the
# threat-footprint test). ``{where}`` is filled with an optional spatial restriction.
_MID = "ST_LineInterpolatePoint(the_geom, 0.5)"
_EDGE_SELECT = (
    "SELECT gid, "
    f"ST_Y({_MID}) AS lat, "
    f"ST_X({_MID}) AS lon, "
    f"ST_X(ST_Transform({_MID}, {_UTM_SRID})) AS ux, "
    f"ST_Y(ST_Transform({_MID}, {_UTM_SRID})) AS uy, "
    "COALESCE(length_m, 0) AS length_m FROM ways{where}"
)


def _edge_params(
    gid: int, terrain: str, road: str, threat: int, length_m: float
) -> dict[str, object]:
    factors = tile_factors(TerrainType(terrain), RoadCondition(road))
    time_cost = edge_time_cost(length_m, factors)
    return {
        "g": gid,
        "sf": factors.speed_factor,
        "ff": factors.fuel_factor,
        "tc": time_cost,
        "t": threat,
        "s": safe_edge_cost(time_cost, threat),
    }


async def _load_terrain_road(session: AsyncSession) -> dict[str, tuple[str, str]]:
    """H3 cell → (terrain, road_condition) for every tile — the ground an edge sits on."""
    return {
        h: (terrain, road)
        for h, terrain, road in (
            await session.execute(text("SELECT h3_index, terrain, road_condition FROM tiles"))
        ).all()
    }


async def _load_threats(session: AsyncSession) -> list[LocatedThreat]:
    """Tiles with threat as located threats in UTM 32632.

    Each threat's grid code (footprint side) is its located-event ``precision_m`` when the tile
    carries one, else the ambient default (1 km) — the same rule the frontend uses, so colour and
    cost paint the same square.
    """
    pt = f"ST_Transform(ST_SetSRID(ST_MakePoint(center_lon, center_lat), 4326), {_UTM_SRID})"
    rows = (
        await session.execute(
            text(
                f"SELECT threat_level, ST_X({pt}) AS x, ST_Y({pt}) AS y, "
                "(last_event->>'precision_m') AS prec "
                "FROM tiles WHERE threat_level > 0"
            )
        )
    ).all()
    threats: list[LocatedThreat] = []
    for level, x, y, prec in rows:
        precision = int(prec) if prec is not None else DEFAULT_THREAT_PRECISION_M
        threats.append(
            LocatedThreat(x=float(x), y=float(y), level=int(level), precision_m=precision)
        )
    return threats


def _effective_threat(
    ux: float,
    uy: float,
    lat: float,
    lon: float,
    threats: Sequence[LocatedThreat],
    enemies: Sequence[EnemyUnit],
) -> int:
    """SAFE-metric threat for an edge: max(footprint threat at the midpoint, enemy proximity)."""
    return max(threat_at(ux, uy, threats), enemy_threat_at(lat, lon, enemies))


async def annotate_ways(
    session: AsyncSession, enemies: Sequence[EnemyUnit] | None = None
) -> int:
    """Add/refresh per-edge factors + time/safe costs over the whole graph. Returns the edge count.

    ``safe_cost`` uses the *effective* threat = max(footprint threat, enemy-proximity threat), so
    SAFE routes around both threatened cells (at their own resolution) and OPFOR danger circles;
    FAST (``time_cost``) is unaffected. Enemy positions default to the configured provider.
    """
    if enemies is None:
        enemies = list(build_enemy_unit_provider().units())
    for col in _NEW_COLUMNS:
        await session.execute(text(f"ALTER TABLE ways ADD COLUMN IF NOT EXISTS {col}"))

    terrain_road = await _load_terrain_road(session)
    threats = await _load_threats(session)
    edges = (await session.execute(text(_EDGE_SELECT.format(where="")))).all()

    params = []
    for gid, lat, lon, ux, uy, length_m in edges:
        cell = h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION)
        terrain, road = terrain_road.get(cell, (TerrainType.UNKNOWN, RoadCondition.CLEAR))
        eff = _effective_threat(ux, uy, lat, lon, threats, enemies)
        p = _edge_params(gid, terrain, road, eff, length_m)
        p["cell"] = cell
        params.append(p)
    if params:
        await session.execute(
            text(
                "UPDATE ways SET speed_factor = :sf, fuel_factor = :ff, time_cost = :tc, "
                "time_reverse_cost = :tc, threat_level = :t, safe_cost = :s, "
                "safe_reverse_cost = :s, cell_h3 = :cell WHERE gid = :g"
            ),
            params,
        )
    await session.commit()
    return len(params)


async def annotate_cell(
    session: AsyncSession, h3_index: str, enemies: Sequence[EnemyUnit] | None = None
) -> int:
    """Re-cost edges affected by one tile's change. Returns the edge count.

    A threat now paints its grid-code footprint (up to ~2 km), so a tile change can affect edges
    beyond its own H3 cell. We re-cost every edge whose midpoint lies within ``RECOST_RADIUS_M`` of
    the changed tile centre, recomputing each edge's effective threat over *all* current threats
    (highest-wins) — so a removed/lowered threat un-penalises edges a larger overlapping threat no
    longer shadows. Uses the same cost model as the bulk annotation.
    """
    if enemies is None:
        enemies = list(build_enemy_unit_provider().units())
    tile = (
        await session.execute(
            text("SELECT center_lat, center_lon FROM tiles WHERE h3_index = :h"),
            {"h": h3_index},
        )
    ).first()
    if tile is None:
        return 0
    clat, clon = tile

    terrain_road = await _load_terrain_road(session)
    threats = await _load_threats(session)
    edges = (
        await session.execute(
            text(
                _EDGE_SELECT.format(
                    where=(
                        " WHERE ST_DWithin("
                        "ST_LineInterpolatePoint(the_geom, 0.5)::geography, "
                        "ST_SetSRID(ST_MakePoint(:lon, :lat), 4326)::geography, :r)"
                    )
                )
            ),
            {"lon": clon, "lat": clat, "r": RECOST_RADIUS_M},
        )
    ).all()
    params = []
    for gid, lat, lon, ux, uy, length_m in edges:
        cell = h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION)
        terrain, road = terrain_road.get(cell, (TerrainType.UNKNOWN, RoadCondition.CLEAR))
        eff = _effective_threat(ux, uy, lat, lon, threats, enemies)
        params.append(_edge_params(gid, terrain, road, eff, length_m))
    if params:
        await session.execute(text(_UPDATE_SQL), params)
    await session.commit()
    return len(params)
