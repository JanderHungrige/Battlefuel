"""Inject operator-drawn roads/paths into the pgRouting graph (v2 Wave 20 F4).

Drawn edges live in the persistent ``drawn_edges`` table (operator-authored, survives reseed). This
service re-materialises them into the osm2pgrouting ``ways`` / ``ways_vertices_pgr`` tables so every
router (pgRouting road, hybrid, terrain) can use them. Injection is **idempotent**: a ``drawn_id``
marker column tags injected rows, and each run deletes all tagged rows then re-adds every drawn edge
from the table — so POST, DELETE, and reseed all converge on the same graph state.

Per drawn edge we add: a start + end vertex, the drawn LineString as one edge, and (per the
operator's connect choice) a straight connector edge from an endpoint to its nearest existing graph
vertex. A **road** is costed like a clear road; a **path** is a penalised track. Costs reuse the
shared ``cost_model`` so plan/sim estimates stay consistent. All SQL is parameterised — drawn
coordinates are bound, never interpolated.
"""

from __future__ import annotations

import json
import math

import h3
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.drawn_edge import DrawnEdgeRow
from app.services.cost_model import (
    OFFROAD_FUEL_PENALTY,
    OFFROAD_STUB_SPEED_FACTOR,
    safe_edge_cost,
)
from app.services.tile_grid import DEFAULT_RESOLUTION

_EARTH_M = 6_371_000.0


def haversine_m(a: list[float], b: list[float]) -> float:
    """Great-circle distance in metres between two ``[lon, lat]`` points."""
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * _EARTH_M * math.asin(math.sqrt(h))


def line_length_m(coords: list[list[float]]) -> float:
    """Total length of a ``[lon, lat]`` polyline in metres."""
    return sum(haversine_m(coords[i], coords[i + 1]) for i in range(len(coords) - 1))


def midpoint(coords: list[list[float]]) -> list[float]:
    """The middle vertex of the polyline (used for the edge's threat-cell lookup)."""
    return coords[len(coords) // 2]


def connect_flags(connect: str) -> tuple[bool, bool]:
    """Map a connect choice to ``(connect_start, connect_end)`` booleans."""
    return connect in ("first", "both"), connect in ("last", "both")


def linestring_geojson(coords: list[list[float]]) -> str:
    """Serialise ``[lon, lat]`` coords as a GeoJSON LineString string (for ST_GeomFromGeoJSON)."""
    return json.dumps({"type": "LineString", "coordinates": coords})


def edge_cost_params(kind: str, length_m: float, threat: int) -> dict[str, float]:
    """Cost columns for an injected edge. ``road`` = clear road; ``path`` = penalised track."""
    if kind == "path":
        speed = OFFROAD_STUB_SPEED_FACTOR
        fuel = OFFROAD_FUEL_PENALTY
    else:
        speed = 1.0
        fuel = 1.0
    time_cost = length_m / speed if speed > 0 else length_m
    return {
        "speed_factor": speed,
        "fuel_factor": fuel,
        "time_cost": time_cost,
        "safe_cost": safe_edge_cost(time_cost, threat),
    }


_INSERT_VERTEX = text(
    "INSERT INTO ways_vertices_pgr (the_geom, lon, lat, drawn_id) "
    "VALUES (ST_SetSRID(ST_MakePoint(:lon, :lat), 4326), :lon, :lat, :did) RETURNING id"
)

_INSERT_EDGE = text(
    "INSERT INTO ways (the_geom, source, target, length_m, cost, reverse_cost, "
    "time_cost, time_reverse_cost, safe_cost, safe_reverse_cost, speed_factor, fuel_factor, "
    "threat_level, cell_h3, drawn_id) VALUES ("
    "ST_SetSRID(ST_GeomFromGeoJSON(:gj), 4326), :src, :tgt, :len, :tc, :tc, "
    ":tc, :tc, :sc, :sc, :spd, :fuel, :threat, :cell, :did)"
)

_NEAREST_BASE_VERTEX = text(
    "SELECT id, ST_X(the_geom) AS lon, ST_Y(the_geom) AS lat FROM ways_vertices_pgr "
    "WHERE drawn_id IS NULL "
    "ORDER BY the_geom <-> ST_SetSRID(ST_MakePoint(:lon, :lat), 4326) LIMIT 1"
)


def _cell_threat(pt: list[float], tiles: dict[str, int]) -> tuple[str, int]:
    cell = h3.latlng_to_cell(pt[1], pt[0], DEFAULT_RESOLUTION)
    return cell, tiles.get(cell, 0)


async def _add_vertex(session: AsyncSession, pt: list[float], did: str) -> int:
    vid = (
        await session.execute(_INSERT_VERTEX, {"lon": pt[0], "lat": pt[1], "did": did})
    ).scalar_one()
    return int(vid)


async def _add_edge(
    session: AsyncSession,
    *,
    did: str,
    src: int,
    tgt: int,
    coords: list[list[float]],
    kind: str,
    tiles: dict[str, int],
) -> None:
    length_m = line_length_m(coords)
    cell, threat = _cell_threat(midpoint(coords), tiles)
    cost = edge_cost_params(kind, length_m, threat)
    await session.execute(
        _INSERT_EDGE,
        {
            "gj": linestring_geojson(coords),
            "src": src,
            "tgt": tgt,
            "len": length_m,
            "tc": cost["time_cost"],
            "sc": cost["safe_cost"],
            "spd": cost["speed_factor"],
            "fuel": cost["fuel_factor"],
            "threat": threat,
            "cell": cell,
            "did": did,
        },
    )


async def _add_connector(
    session: AsyncSession,
    *,
    did: str,
    endpoint: list[float],
    drawn_vertex: int,
    to_drawn: bool,
    tiles: dict[str, int],
) -> int:
    """Bridge a drawn endpoint to its nearest existing (base) graph vertex with a road connector."""
    r = (
        await session.execute(_NEAREST_BASE_VERTEX, {"lon": endpoint[0], "lat": endpoint[1]})
    ).first()
    if r is None:
        return 0
    base = [float(r.lon), float(r.lat)]
    coords = [base, endpoint] if to_drawn else [endpoint, base]
    src, tgt = (int(r.id), drawn_vertex) if to_drawn else (drawn_vertex, int(r.id))
    await _add_edge(session, did=did, src=src, tgt=tgt, coords=coords, kind="road", tiles=tiles)
    return 1


async def _inject_one(
    session: AsyncSession, row: DrawnEdgeRow, tiles: dict[str, int]
) -> int:
    coords = [[float(x), float(y)] for x, y in row.coordinates]
    start, end = coords[0], coords[-1]
    sv = await _add_vertex(session, start, row.id)
    ev = await _add_vertex(session, end, row.id)
    await _add_edge(session, did=row.id, src=sv, tgt=ev, coords=coords, kind=row.kind, tiles=tiles)
    count = 1
    if row.connect_start:
        count += await _add_connector(
            session, did=row.id, endpoint=start, drawn_vertex=sv, to_drawn=True, tiles=tiles
        )
    if row.connect_end:
        count += await _add_connector(
            session, did=row.id, endpoint=end, drawn_vertex=ev, to_drawn=False, tiles=tiles
        )
    return count


async def inject_drawn_edges(session: AsyncSession) -> int:
    """(Re-)materialise all persisted drawn edges into the ``ways`` graph. Returns the edge count.

    Idempotent: ensures the ``drawn_id`` marker columns, deletes all previously injected rows, then
    re-adds every ``DrawnEdgeRow``. Safe to call on POST/DELETE and after each reseed annotate.
    """
    await session.execute(text("ALTER TABLE ways ADD COLUMN IF NOT EXISTS drawn_id text"))
    await session.execute(
        text("ALTER TABLE ways_vertices_pgr ADD COLUMN IF NOT EXISTS drawn_id text")
    )
    await session.execute(text("DELETE FROM ways WHERE drawn_id IS NOT NULL"))
    await session.execute(text("DELETE FROM ways_vertices_pgr WHERE drawn_id IS NOT NULL"))

    rows = (await session.execute(select(DrawnEdgeRow))).scalars().all()
    if not rows:
        await session.commit()
        return 0
    tiles = {
        h: int(threat)
        for h, threat in (
            await session.execute(text("SELECT h3_index, threat_level FROM tiles"))
        ).all()
    }
    count = 0
    for row in rows:
        count += await _inject_one(session, row, tiles)
    await session.commit()
    return count
