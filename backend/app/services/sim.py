"""Pure simulation math for advancing a move order (Wave 3, sim-engine).

No I/O — given an order, current fuel, the unit type, and a game-time delta, compute the
next position, progress, fuel, and status. The runner (sim_runner.py) applies these to the
DB and broadcasts them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.unit import UnitType

_EARTH_RADIUS_M = 6_371_000.0


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in metres between two [lon, lat] points."""
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def polyline_length_m(geometry: list[list[float]]) -> float:
    """Total length of a [lon, lat] polyline in metres."""
    return sum(
        haversine_m(geometry[i][0], geometry[i][1], geometry[i + 1][0], geometry[i + 1][1])
        for i in range(len(geometry) - 1)
    )


def point_at(geometry: list[list[float]], dist_m: float) -> list[float]:
    """Interpolate the [lon, lat] point ``dist_m`` along the polyline."""
    if not geometry:
        return [0.0, 0.0]
    if dist_m <= 0:
        return list(geometry[0])
    acc = 0.0
    for i in range(len(geometry) - 1):
        seg = haversine_m(geometry[i][0], geometry[i][1], geometry[i + 1][0], geometry[i + 1][1])
        if acc + seg >= dist_m:
            t = (dist_m - acc) / seg if seg > 0 else 0.0
            return [
                geometry[i][0] + t * (geometry[i + 1][0] - geometry[i][0]),
                geometry[i][1] + t * (geometry[i + 1][1] - geometry[i][1]),
            ]
        acc += seg
    return list(geometry[-1])


@dataclass(frozen=True)
class SimStep:
    progress_m: float
    lon: float
    lat: float
    fuel_l: float
    status: MoveOrderStatus


def advance(order: MoveOrder, fuel_l: float, unit_type: UnitType, dt_game_s: float) -> SimStep:
    """Advance ``order`` by ``dt_game_s`` of game-time at the unit's road speed."""
    total = polyline_length_m(order.geometry)
    speed_mps = unit_type.movement.speed_road_kph * 1000.0 / 3600.0
    new_progress = order.progress_m + speed_mps * dt_game_s
    burn = unit_type.fuel.consumption_normal_lph * (dt_game_s / 3600.0)
    new_fuel = max(0.0, fuel_l - burn)
    if new_progress >= total:
        end = order.geometry[-1] if order.geometry else [0.0, 0.0]
        return SimStep(total, end[0], end[1], new_fuel, MoveOrderStatus.COMPLETE)
    pt = point_at(order.geometry, new_progress)
    return SimStep(new_progress, pt[0], pt[1], new_fuel, MoveOrderStatus.ACTIVE)
