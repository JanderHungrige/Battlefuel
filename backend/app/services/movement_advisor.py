"""Heuristic movement & route advice (Wave 6 Feature 4: movement-route-advisor).

Pure helpers (no DB, no OR-Tools): ``rank_routes`` scores the planner's options, and
``reposition_suggestions`` flags units worth moving (low fuel → nearest depot; high-threat sector
→ nearest safe cell). Bounded heuristics — full positioning optimization is deferred.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.route import RouteOption
from app.domain.supply import FuelDepot
from app.domain.tile import Tile
from app.domain.unit import NatoUnitType
from app.domain.unit_instance import UnitInstance
from app.providers.base import UnitDataProvider
from app.services.sim import haversine_m

_THREAT_WEIGHT_MIN = 10.0  # one threat level ≈ 10 minutes of detour
_INSUFFICIENT_PENALTY = 100_000.0
_LOW_FUEL_FRACTION = 0.25
_HIGH_THREAT = 3


def rank_routes(options: Sequence[RouteOption]) -> list[tuple[RouteOption, float, str]]:
    """Rank route options best-first. Score (lower=better) = minutes + threat + fuel penalty."""
    scored: list[tuple[RouteOption, float, str]] = []
    for opt in options:
        minutes = opt.duration_s / 60.0
        score = minutes + opt.threat_max * _THREAT_WEIGHT_MIN
        if not opt.sufficient_fuel:
            score += _INSUFFICIENT_PENALTY
            rationale = (
                f"{opt.label}: INSUFFICIENT FUEL (arrives {opt.fuel_remaining_l:.0f} L), "
                f"{minutes:.0f} min, threat {opt.threat_max}/5"
            )
        else:
            rationale = (
                f"{opt.label}: {minutes:.0f} min, threat {opt.threat_max}/5, "
                f"arrives with {opt.fuel_remaining_l:.0f} L"
            )
        scored.append((opt, score, rationale))
    scored.sort(key=lambda t: t[1])
    return scored


def _nearest(
    lat: float, lon: float, candidates: Sequence[tuple[float, float]]
) -> tuple[float, float] | None:
    best: tuple[float, float] | None = None
    best_d = float("inf")
    for c_lat, c_lon in candidates:
        d = haversine_m(lon, lat, c_lon, c_lat)
        if d < best_d:
            best_d, best = d, (c_lat, c_lon)
    return best


def reposition_suggestions(
    units: Sequence[UnitInstance],
    catalog: UnitDataProvider,
    tiles: Sequence[Tile],
    depots: Sequence[FuelDepot],
) -> list[tuple[str, float, float, float, str]]:
    """Suggest at most one reposition per unit: (unit_id, dest_lat, dest_lon, score, why)."""
    tile_by_h3 = {t.h3_index: t for t in tiles}
    depot_points = [(d.lat, d.lon) for d in depots]
    safe_points = [(t.center_lat, t.center_lon) for t in tiles if t.threat_level == 0]

    out: list[tuple[str, float, float, float, str]] = []
    for unit in units:
        ut = catalog.get_unit(unit.unit_type_id)
        if ut is None or ut.nato_unit_type is NatoUnitType.FUEL_SUPPLY:
            continue
        capacity = ut.fuel.capacity_liters

        # Rule A — low fuel → nearest depot (wins over the threat rule).
        if (
            unit.current_fuel_liters is not None
            and capacity > 0
            and unit.current_fuel_liters / capacity < _LOW_FUEL_FRACTION
            and depot_points
        ):
            dest = _nearest(unit.lat, unit.lon, depot_points)
            if dest is not None:
                pct = unit.current_fuel_liters / capacity * 100
                km = haversine_m(unit.lon, unit.lat, dest[1], dest[0]) / 1000.0
                why = f"Low fuel ({pct:.0f}%) → nearest depot"
                out.append((unit.id, dest[0], dest[1], km, why))
                continue

        # Rule B — sitting in a high-threat sector → nearest safe (threat-0) cell.
        tile = tile_by_h3.get(unit.h3_index)
        if tile is not None and tile.threat_level >= _HIGH_THREAT and safe_points:
            dest = _nearest(unit.lat, unit.lon, safe_points)
            if dest is not None and (dest[0], dest[1]) != (unit.lat, unit.lon):
                km = haversine_m(unit.lon, unit.lat, dest[1], dest[0]) / 1000.0
                out.append(
                    (
                        unit.id,
                        dest[0],
                        dest[1],
                        km,
                        f"High threat ({tile.threat_level}/5) → nearest safe cell",
                    )
                )
    return out
