"""Annotate the osm2pgrouting `ways` table with game data (Wave 3 routing-graph; Wave 4
tile-cost-model).

osm2pgrouting builds `ways` (edges) with `length_m`, `source`, `target`, `the_geom`. We add,
per edge (from the tile containing its midpoint): `speed_factor`/`fuel_factor` (terrain x
road_condition), a terrain-aware `time_cost` (the FAST metric), and a threat-weighted
`safe_cost` (the SAFE metric). Blocked roads get an impassable sentinel cost. The cost model
(`services.cost_model`) is the single source of truth, shared with the planner and the sim.
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
from app.services.tile_grid import DEFAULT_RESOLUTION

_NEW_COLUMNS = (
    "speed_factor double precision NOT NULL DEFAULT 1.0",
    "fuel_factor double precision NOT NULL DEFAULT 1.0",
    "time_cost double precision",
    "time_reverse_cost double precision",
    "threat_level integer NOT NULL DEFAULT 0",
    "safe_cost double precision",
    "safe_reverse_cost double precision",
    "cell_h3 text",  # H3 cell of the edge midpoint — enables targeted re-annotation
)

_UPDATE_SQL = (
    "UPDATE ways SET speed_factor = :sf, fuel_factor = :ff, time_cost = :tc, "
    "time_reverse_cost = :tc, threat_level = :t, safe_cost = :s, safe_reverse_cost = :s "
    "WHERE gid = :g"
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


async def annotate_ways(
    session: AsyncSession, enemies: Sequence[EnemyUnit] | None = None
) -> int:
    """Add/refresh per-edge factors + time/safe costs. Returns the edge count.

    ``safe_cost`` uses the *effective* threat = max(tile threat, enemy-proximity threat), so SAFE
    routes around OPFOR danger circles (v2 Wave 16); FAST (``time_cost``) is unaffected. Enemy
    positions default to the configured provider; pass an explicit list in tests.
    """
    if enemies is None:
        enemies = list(build_enemy_unit_provider().units())
    for col in _NEW_COLUMNS:
        await session.execute(text(f"ALTER TABLE ways ADD COLUMN IF NOT EXISTS {col}"))

    tiles = {
        h: (terrain, road, int(threat))
        for h, terrain, road, threat in (
            await session.execute(
                text("SELECT h3_index, terrain, road_condition, threat_level FROM tiles")
            )
        ).all()
    }
    edges = (
        await session.execute(
            text(
                "SELECT gid, "
                "ST_Y(ST_LineInterpolatePoint(the_geom, 0.5)) AS lat, "
                "ST_X(ST_LineInterpolatePoint(the_geom, 0.5)) AS lon, "
                "COALESCE(length_m, 0) AS length_m FROM ways"
            )
        )
    ).all()

    params = []
    for gid, lat, lon, length_m in edges:
        cell = h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION)
        terrain, road, threat = tiles.get(cell, (TerrainType.UNKNOWN, RoadCondition.CLEAR, 0))
        eff_threat = max(threat, enemy_threat_at(lat, lon, enemies))
        p = _edge_params(gid, terrain, road, eff_threat, length_m)
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
    """Re-cost just the edges in one H3 cell after its tile changed. Returns the edge count.

    Targeted via the stored ``cell_h3`` column (populated by ``annotate_ways``); falls back to
    a no-op if the cell has no edges. Uses the same cost model as the bulk annotation, including
    the enemy-proximity danger boost (so an event re-cost near an enemy keeps avoiding it).
    """
    if enemies is None:
        enemies = list(build_enemy_unit_provider().units())
    tile = (
        await session.execute(
            text("SELECT terrain, road_condition, threat_level FROM tiles WHERE h3_index = :h"),
            {"h": h3_index},
        )
    ).first()
    if tile is None:
        return 0
    terrain, road, threat = tile
    edges = (
        await session.execute(
            text(
                "SELECT gid, "
                "ST_Y(ST_LineInterpolatePoint(the_geom, 0.5)) AS lat, "
                "ST_X(ST_LineInterpolatePoint(the_geom, 0.5)) AS lon, "
                "COALESCE(length_m, 0) AS length_m FROM ways WHERE cell_h3 = :h"
            ),
            {"h": h3_index},
        )
    ).all()
    params = []
    for gid, lat, lon, length_m in edges:
        eff_threat = max(int(threat), enemy_threat_at(lat, lon, enemies))
        params.append(_edge_params(gid, terrain, road, eff_threat, length_m))
    if params:
        await session.execute(text(_UPDATE_SQL), params)
    await session.commit()
    return len(params)
