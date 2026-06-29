"""Multi-resolution threat model (v2 Wave 21, threat-grid-code-model).

A located threat has a coordinate, an integer ``level`` (0..5) and a *grid code* — the size of the
MGRS-aligned square it occupies (``precision_m``). Its **footprint** is the square of that side
holding its coordinate. Threats nest **highest-wins**: a point's threat is the max ``level`` over
every threat whose footprint covers it, so a small high-threat patch shows through a larger
low-threat area. Both the map colour (frontend) and the routing-edge penalty (``routing_graph``)
read this one field, so colour and cost always agree.

Pure + CRS-agnostic: coordinates are plain metres in any single projected CRS. Callers pass UTM
(PostGIS ``EPSG:32632`` on the backend, proj4 zone 32N on the frontend) so the snapping lattice
matches the drawn MGRS grid. No I/O; deterministic; unit-testable with plain numbers.
"""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Final

# Grid-code side (metres) for a threat with no explicit located-event precision: the native size of
# an ambient/seeded tile threat (~the H3 res-8 hex, ≈ the 1 km MGRS cell). Mirrors the frontend
# ``DEFAULT_THREAT_PRECISION_M`` so seeded threat paints the same square on both sides.
DEFAULT_THREAT_PRECISION_M: Final[int] = 1000


@dataclass(frozen=True)
class LocatedThreat:
    """A threat at projected ``(x, y)`` metres, with ``level`` 0..5 and grid-code ``precision_m``.

    ``precision_m`` is the side of the MGRS-aligned square the threat occupies (its footprint).
    """

    x: float
    y: float
    level: int
    precision_m: int = DEFAULT_THREAT_PRECISION_M


def cell_origin(coord: float, precision_m: int) -> float:
    """Snap a metric coordinate DOWN to the precision lattice (the lattice the MGRS grid draws)."""
    return math.floor(coord / precision_m) * precision_m


def footprint_contains(threat: LocatedThreat, x: float, y: float) -> bool:
    """True if ``(x, y)`` lies in the threat's grid-code square (the ``precision_m`` cell of it)."""
    p = threat.precision_m
    e0 = cell_origin(threat.x, p)
    n0 = cell_origin(threat.y, p)
    return e0 <= x < e0 + p and n0 <= y < n0 + p


def threat_at(x: float, y: float, threats: Iterable[LocatedThreat]) -> int:
    """Highest-wins threat level at ``(x, y)``: max ``level`` over threats whose footprint holds it.

    This is the per-point read used by routing edges (an edge midpoint resolves its threat at the
    correct resolution). Returns 0 when no footprint covers the point.
    """
    best = 0
    for t in threats:
        if t.level > best and footprint_contains(t, x, y):
            best = t.level
    return best


def base_cells(threats: Iterable[LocatedThreat], base_m: int) -> dict[tuple[int, int], int]:
    """Decompose threats into the base-resolution cells they cover, taking the max level per cell.

    Returns ``{(i, j): level}`` keyed by base-cell index ``(floor(x/base), floor(y/base))`` — the
    conceptual "base-cell threat field" the wave describes. ``threat_at`` is the per-point
    equivalent edges use; rendering emits one square per threat footprint (equal in the limit).
    ``base_m`` should divide the grid codes evenly (e.g. 500 m divides 500/1000/2000).
    """
    field: dict[tuple[int, int], int] = {}
    for t in threats:
        p = t.precision_m
        e0 = cell_origin(t.x, p)
        n0 = cell_origin(t.y, p)
        bx0, by0 = math.floor(e0 / base_m), math.floor(n0 / base_m)
        bx1, by1 = math.ceil((e0 + p) / base_m), math.ceil((n0 + p) / base_m)
        for i in range(bx0, bx1):
            for j in range(by0, by1):
                if t.level > field.get((i, j), 0):
                    field[(i, j)] = t.level
    return field
