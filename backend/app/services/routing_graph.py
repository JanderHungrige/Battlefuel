"""Annotate the osm2pgrouting `ways` table with game data (Wave 3, routing-graph).

osm2pgrouting builds `ways` (edges) with `length_m`, `source`, `target`, `the_geom`. We add
a per-edge `threat_level` (from the tile containing the edge midpoint) and a threat-weighted
`safe_cost` used by the "safe" routing metric. Roads are treated as bidirectional for the
game (one-way restrictions are ignored).
"""

from __future__ import annotations

import h3
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.tile_grid import DEFAULT_RESOLUTION

# How strongly threat inflates the routing cost: safe_cost = length_m * (1 + W * threat_level).
THREAT_WEIGHT = 5.0


async def annotate_ways(session: AsyncSession) -> int:
    """Add/refresh threat_level + safe_cost on every edge. Returns the edge count."""
    await session.execute(
        text("ALTER TABLE ways ADD COLUMN IF NOT EXISTS threat_level integer NOT NULL DEFAULT 0")
    )
    await session.execute(
        text("ALTER TABLE ways ADD COLUMN IF NOT EXISTS safe_cost double precision")
    )
    await session.execute(
        text("ALTER TABLE ways ADD COLUMN IF NOT EXISTS safe_reverse_cost double precision")
    )

    tiles = {
        h: t
        for h, t in (await session.execute(text("SELECT h3_index, threat_level FROM tiles"))).all()
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
        threat = int(tiles.get(h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION), 0))
        safe = length_m * (1.0 + THREAT_WEIGHT * threat)
        params.append({"g": gid, "t": threat, "s": safe})
    if params:
        await session.execute(
            text(
                "UPDATE ways SET threat_level = :t, safe_cost = :s, safe_reverse_cost = :s "
                "WHERE gid = :g"
            ),
            params,
        )
    await session.commit()
    return len(params)
