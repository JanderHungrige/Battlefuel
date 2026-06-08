"""Generate the tile grid and seed terrain from OSM (Feature 3).

Idempotent: tiles are inserted with ``ON CONFLICT DO NOTHING``, then terrain is derived
by spatially joining each tile's center against the imported ``osm_multipolygons`` and
picking the smallest (most specific) containing polygon.
"""

from __future__ import annotations

from random import Random

from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.frontline import initial_threat_level
from app.domain.theater import HOHENFELS, Theater
from app.models.tile import TileRow
from app.services.tile_grid import DEFAULT_RESOLUTION, cell_center, generate_cells

# Derive terrain from the smallest OSM polygon containing each tile center.
_TERRAIN_SQL = text(
    """
    UPDATE tiles t SET terrain = sub.terrain
    FROM (
        SELECT DISTINCT ON (t2.h3_index) t2.h3_index AS h3_index,
            CASE
                WHEN o."natural" IN ('water','bay','strait') THEN 'water'
                WHEN o."natural" IN ('wetland','marsh') THEN 'wetland'
                WHEN o."natural" = 'wood' OR o.landuse = 'forest' THEN 'forest'
                WHEN o.military IS NOT NULL THEN 'military'
                WHEN o.landuse IN ('residential','industrial','commercial','retail')
                     OR o.building IS NOT NULL THEN 'urban'
                WHEN o.landuse IN ('farmland','farmyard','meadow','orchard','vineyard')
                    THEN 'farmland'
                ELSE 'open'
            END AS terrain
        FROM tiles t2
        JOIN osm_multipolygons o
            ON ST_Contains(o.geom, ST_SetSRID(ST_MakePoint(t2.center_lon, t2.center_lat), 4326))
        WHERE o."natural" IS NOT NULL OR o.landuse IS NOT NULL
              OR o.building IS NOT NULL OR o.military IS NOT NULL
        ORDER BY t2.h3_index, ST_Area(o.geom) ASC
    ) sub
    WHERE sub.h3_index = t.h3_index
    """
)


async def generate_and_store_tiles(
    session: AsyncSession,
    theater: Theater = HOHENFELS,
    resolution: int = DEFAULT_RESOLUTION,
) -> int:
    """Create the hex grid for ``theater`` and seed terrain from OSM. Returns cell count."""
    cells = generate_cells(theater, resolution)
    rows = []
    for cell in cells:
        lat, lon = cell_center(cell)
        rows.append(
            {
                "h3_index": cell,
                "resolution": resolution,
                "center_lat": lat,
                "center_lon": lon,
                "terrain": "open",
            }
        )
    if rows:
        stmt = pg_insert(TileRow).values(rows).on_conflict_do_nothing(index_elements=["h3_index"])
        await session.execute(stmt)
    await session.execute(_TERRAIN_SQL)
    await session.commit()
    return len(cells)


async def seed_frontline_threats(session: AsyncSession, *, seed: int = 1414) -> int:
    """Reset every tile's ``threat_level`` to the initial frontline pattern. Returns tile count.

    Overwrites whatever threat the tiles currently hold (default 0 on a fresh grid, or values
    accumulated by the event engine over a previous sim run) so a game STARTS with threat
    concentrated on the front + the OPFOR east instead of empty or spread/stale. Deterministic:
    tiles are processed in ``h3_index`` order against a seeded RNG, so the map is reproducible
    (v2 Wave 14). Run after ``generate_and_store_tiles`` and before ``annotate_routing`` (the
    routing graph's safe-cost reads tile threat).
    """
    rng = Random(seed)
    result = await session.execute(
        text("SELECT h3_index, center_lat, center_lon FROM tiles ORDER BY h3_index")
    )
    rows = result.all()
    for h3_index, lat, lon in rows:
        await session.execute(
            text("UPDATE tiles SET threat_level = :t WHERE h3_index = :h"),
            {"t": initial_threat_level(lat, lon, rng), "h": h3_index},
        )
    await session.commit()
    return len(rows)
