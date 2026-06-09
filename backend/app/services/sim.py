"""Pure simulation math for advancing a move order (Wave 3, sim-engine).

No I/O — given an order, current fuel, the unit type, and a game-time delta, compute the
next position, progress, fuel, and status. The runner (sim_runner.py) applies these to the
DB and broadcasts them.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.route import RouteMetric
from app.domain.unit import UnitType
from app.services.cost_model import TileFactors

_EARTH_RADIUS_M = 6_371_000.0

# Threat level (0-5) at/above which a tile counts as a combat ("red") sector for crossing rules.
THREAT_L5: int = 5
# "Proceed slowly" crossing penalties: a physical block is a heavy crawl, threat a lighter one.
# Each is a speed_factor floor + a fuel-burn multiplier applied while crossing.
BLOCK_CROSS_SPEED_FACTOR: float = 0.08
BLOCK_CROSS_FUEL_FACTOR: float = 1.5
THREAT_CROSS_SPEED_FACTOR: float = 0.4
THREAT_CROSS_FUEL_FACTOR: float = 1.2


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


def advance(
    order: MoveOrder,
    fuel_l: float,
    unit_type: UnitType,
    dt_game_s: float,
    *,
    speed_factor: float = 1.0,
    fuel_factor: float = 1.0,
) -> SimStep:
    """Advance ``order`` by ``dt_game_s`` of game-time at the unit's tile-adjusted road speed.

    ``speed_factor``/``fuel_factor`` come from the current tile (Wave 4 tile-cost-model):
    speed 0 (blocked road) ⇒ the unit makes no progress this tick but still burns fuel.
    """
    total = polyline_length_m(order.geometry)
    speed_mps = unit_type.movement.speed_road_kph * speed_factor * 1000.0 / 3600.0
    new_progress = order.progress_m + speed_mps * dt_game_s
    burn = unit_type.fuel.consumption_normal_lph * fuel_factor * (dt_game_s / 3600.0)
    new_fuel = max(0.0, fuel_l - burn)
    if new_progress >= total:
        end = order.geometry[-1] if order.geometry else [0.0, 0.0]
        return SimStep(total, end[0], end[1], new_fuel, MoveOrderStatus.COMPLETE)
    pt = point_at(order.geometry, new_progress)
    return SimStep(new_progress, pt[0], pt[1], new_fuel, MoveOrderStatus.ACTIVE)


def substep_dt(remaining_game_s: float, speed_mps: float, max_step_m: float) -> float:
    """Game-seconds for one sub-step that advances at most ``max_step_m`` (v2 Wave 10).

    Splitting a tick into capped sub-steps keeps on-screen movement smooth. A stationary unit
    (speed 0) or a non-positive cap collapses to the whole remaining step.
    """
    if speed_mps <= 0 or max_step_m <= 0:
        return remaining_game_s
    return min(remaining_game_s, max_step_m / speed_mps)


def _halted(order: MoveOrder, fuel_l: float) -> SimStep:
    """Stop cleanly at the current position: no progress, no fuel burn, status HALTED.

    This replaces the old silent stall (speed 0 ⇒ 0 progress but fuel still bleeding)."""
    pt = point_at(order.geometry, order.progress_m)
    return SimStep(order.progress_m, pt[0], pt[1], fuel_l, MoveOrderStatus.HALTED)


def _as_crossing(step: SimStep) -> SimStep:
    """Tag a step CROSSING unless it already arrived (COMPLETE wins)."""
    if step.status is MoveOrderStatus.COMPLETE:
        return step
    return SimStep(step.progress_m, step.lon, step.lat, step.fuel_l, MoveOrderStatus.CROSSING)


def _as_continuing(step: SimStep) -> SimStep:
    """Tag a step CONTINUING (normal-speed cross) unless it already arrived (COMPLETE wins)."""
    if step.status is MoveOrderStatus.COMPLETE:
        return step
    return SimStep(step.progress_m, step.lon, step.lat, step.fuel_l, MoveOrderStatus.CONTINUING)


def advance_with_terrain(
    order: MoveOrder,
    fuel_l: float,
    unit_type: UnitType,
    dt_game_s: float,
    *,
    factors: TileFactors,
    threat_level: int,
    currently_in_threat: bool = False,
    entering_new_cell: bool = True,
) -> SimStep:
    """Posture- and tile-aware traversal (v2 Wave 10, never-stall-traversal-threat-crossing).

    Decides whether the unit moves, crosses at a penalty, or halts cleanly — so it is *never*
    frozen (0 progress while burning fuel). ``factors``/``threat_level`` describe the tile the
    unit is *entering* this step; ``entering_new_cell`` is whether that is a different H3 cell than
    the unit's current one, and ``currently_in_threat`` whether the current cell is itself a
    threat-L5 sector. Posture is ``order.metric``; ``CROSSING`` = "proceed slowly", ``CONTINUING``
    = "Continue" (normal speed). Pure.

    - **active** order: a blocked tile HALTS. A threat-L5 tile HALTS in SAFE posture on each
      **transition into a (new) threat cell** — so two threat tiles in a row each prompt, and a
      unit that *started* inside threat (no cell change yet) does not pop. FAST crosses at a
      penalty; clear tiles advance normally.
    - **crossing / continuing** order: a Continue/Proceed authorization covers exactly ONE threat
      tile — the unit crawls (CROSSING) or runs (CONTINUING) across it, then on leaving that cell
      it reverts to ACTIVE so the *next* threat tile re-prompts.
    """
    blocked = not factors.passable
    in_threat = threat_level >= THREAT_L5

    # The authorization to cross applies to one tile: once the unit leaves it (a new cell while it
    # was in threat), drop back to ACTIVE handling so the next threat tile raises a fresh halt.
    authorized = order.status in (MoveOrderStatus.CONTINUING, MoveOrderStatus.CROSSING) and not (
        entering_new_cell and currently_in_threat
    )

    if authorized and order.status is MoveOrderStatus.CONTINUING:
        if blocked:
            # A physical block cannot be taken at normal speed — crawl it like CROSSING.
            return _as_continuing(
                advance(
                    order, fuel_l, unit_type, dt_game_s,
                    speed_factor=BLOCK_CROSS_SPEED_FACTOR,
                    fuel_factor=factors.fuel_factor * BLOCK_CROSS_FUEL_FACTOR,
                )
            )
        if in_threat:
            return _as_continuing(
                advance(order, fuel_l, unit_type, dt_game_s,
                        speed_factor=factors.speed_factor, fuel_factor=factors.fuel_factor)
            )
        # cleared the threat → resume normal movement
        return advance(order, fuel_l, unit_type, dt_game_s,
                       speed_factor=factors.speed_factor, fuel_factor=factors.fuel_factor)

    if authorized and order.status is MoveOrderStatus.CROSSING:
        if blocked:
            return _as_crossing(
                advance(
                    order, fuel_l, unit_type, dt_game_s,
                    speed_factor=BLOCK_CROSS_SPEED_FACTOR,
                    fuel_factor=factors.fuel_factor * BLOCK_CROSS_FUEL_FACTOR,
                )
            )
        if in_threat:
            return _as_crossing(
                advance(
                    order, fuel_l, unit_type, dt_game_s,
                    speed_factor=factors.speed_factor * THREAT_CROSS_SPEED_FACTOR,
                    fuel_factor=factors.fuel_factor * THREAT_CROSS_FUEL_FACTOR,
                )
            )
        # cleared the obstruction → resume normal movement
        return advance(order, fuel_l, unit_type, dt_game_s,
                       speed_factor=factors.speed_factor, fuel_factor=factors.fuel_factor)

    # ACTIVE order (or an authorized cross that just left its tile) entering this tile.
    if blocked:
        return _halted(order, fuel_l)
    if in_threat:
        # SAFE halts on each transition INTO a (new) threat cell — but not while still inside the
        # cell it is already in (e.g. a unit that started in threat), which makes no cell change.
        if order.metric is RouteMetric.SAFE and entering_new_cell:
            return _halted(order, fuel_l)
        # FAST took the fast route, or the unit is moving within a threat cell → cross at penalty.
        return advance(
            order, fuel_l, unit_type, dt_game_s,
            speed_factor=factors.speed_factor * THREAT_CROSS_SPEED_FACTOR,
            fuel_factor=factors.fuel_factor * THREAT_CROSS_FUEL_FACTOR,
        )
    return advance(order, fuel_l, unit_type, dt_game_s,
                   speed_factor=factors.speed_factor, fuel_factor=factors.fuel_factor)
