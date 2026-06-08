"""The notional East/West frontline for the seeded Hohenfels scenario (v2 Wave 14).

NATO holds the **WEST**, OPFOR the **EAST**, separated by an irregular north-south frontline -
deliberately not a straight meridian: it weaves around the theater centre (lon 11.85) so the
front has **bulges** (salients reaching east) and **gaps** (dents pulled west). This is the single
shared definition of the front: the unit/depot seeds place forces relative to it
(``instance_seed``, ``enemy_units``, ``supply_seed``) and the event engine concentrates threats
around it (``event_engine``). Pure and deterministic so seeds, the emitter, and tests all agree.
"""

from __future__ import annotations

from itertools import pairwise

# (lat, lon) control points, latitude ASCENDING. The longitudes weave east/west of the theater
# centre (11.85) to give the front its bulges and gaps across the ~10 km north-south span.
FRONTLINE_CONTROL: tuple[tuple[float, float], ...] = (
    (49.180, 11.860),  # south - bulge east
    (49.205, 11.842),  # gap - pulled west
    (49.225, 11.858),  # centre - bulge east
    (49.245, 11.838),  # gap - pulled west
    (49.270, 11.852),  # north
)

# Depots and HQ sit in the deep rear: at or west of this longitude.
REAR_LON_MAX: float = 11.815


def frontline_lon(lat: float) -> float:
    """Longitude of the frontline at ``lat`` (piecewise-linear between control points, clamped)."""
    pts = FRONTLINE_CONTROL
    if lat <= pts[0][0]:
        return pts[0][1]
    if lat >= pts[-1][0]:
        return pts[-1][1]
    for (lat0, lon0), (lat1, lon1) in pairwise(pts):
        if lat0 <= lat <= lat1:
            t = (lat - lat0) / (lat1 - lat0)
            return lon0 + t * (lon1 - lon0)
    return pts[-1][1]  # unreachable: lat is within [first, last] by the guards above


def is_west(lat: float, lon: float) -> bool:
    """True if (lat, lon) lies on the NATO (west) side of the frontline."""
    return lon < frontline_lon(lat)


def is_east(lat: float, lon: float) -> bool:
    """True if (lat, lon) lies on the OPFOR (east) side of the frontline."""
    return lon > frontline_lon(lat)
