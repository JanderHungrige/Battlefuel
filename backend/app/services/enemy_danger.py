"""Enemy-proximity danger for routing (v2 Wave 16, enemy-avoidance-cost).

Each placed OPFOR unit projects a circular danger zone whose radius scales with its echelon (a
section dominates less ground than a company). A point inside a zone gets an integer threat level
(0-5) that is folded into the SAFE routing cost (via the existing ``threat_level`` channel) so SAFE
routes around enemy clusters; FAST (shortest time) is unaffected. Pure + deterministic — no I/O.
"""

from __future__ import annotations

import math
from collections.abc import Iterable

from app.domain.enemy_unit import EnemyUnit

# Echelon -> danger-circle radius in metres. Larger formations threaten more ground.
ECHELON_RADIUS_M: dict[str, float] = {
    "section": 400.0,
    "platoon": 700.0,
    "company": 1200.0,
    "battalion": 2000.0,
}
_DEFAULT_RADIUS_M = 700.0  # used when echelon is unknown/unset

_PEAK_THREAT = 5  # threat at an enemy's centre; falls off linearly to 0 at the circle edge
_M_PER_DEG_LAT = 111_320.0  # metres per degree latitude (good enough at theater scale)


def radius_for(echelon: str | None) -> float:
    """Danger-circle radius (m) for an echelon label; default when unknown."""
    return ECHELON_RADIUS_M.get((echelon or "").lower(), _DEFAULT_RADIUS_M)


def _distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Equirectangular distance in metres — accurate enough across a ~10 km theater."""
    mean_lat = math.radians((lat1 + lat2) / 2.0)
    dx = (lon2 - lon1) * _M_PER_DEG_LAT * math.cos(mean_lat)
    dy = (lat2 - lat1) * _M_PER_DEG_LAT
    return math.hypot(dx, dy)


def enemy_threat_at(lat: float, lon: float, enemies: Iterable[EnemyUnit]) -> int:
    """Integer threat (0..5) at (lat, lon) from enemy proximity — the max over all units.

    Inside a unit's circle the threat ramps linearly from 5 at the centre to 0 at the rim; outside
    every circle it is 0. The radius scales with the unit's echelon (``radius_for``).
    """
    best = 0.0
    for e in enemies:
        r = radius_for(e.echelon)
        d = _distance_m(lat, lon, e.lat, e.lon)
        if d >= r:
            continue
        val = _PEAK_THREAT * (1.0 - d / r)
        best = max(best, val)
    return min(_PEAK_THREAT, round(best))
