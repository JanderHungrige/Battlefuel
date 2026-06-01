"""OR-Tools refuel assignment (Wave 6 Feature 2: refuel-optimizer).

``refuel_cost`` is a pure, tunable cost (distance + fuel-adequacy). ``assign_trucks`` solves the
truck→unit assignment with OR-Tools ``SimpleLinearSumAssignment`` over a square, dummy-padded
complete bipartite graph (so any #units vs #trucks is feasible; a unit matched to a dummy or
incompatible truck is left unserved). Tiny problem sizes — clarity + determinism over speed.
"""

from __future__ import annotations

from collections.abc import Sequence

from ortools.graph.python import linear_sum_assignment

from app.domain.unit_instance import UnitInstance
from app.providers.factory import build_unit_provider
from app.services.sim import haversine_m

# Tunable cost weights (km-equivalent units).
_SHORTFALL_WEIGHT = 50.0  # full inability to cover a unit's deficit ≈ 50 km of detour
_BIG = 10_000_000  # dominates any real cost; used for dummy / incompatible arcs
_SCALE = 100  # float cost → int for the integer solver


def refuel_cost(distance_m: float, truck_fuel: float, unit_deficit: float) -> float:
    """Cost of a truck serving a unit: distance (km) + a fuel-adequacy penalty. Lower = better."""
    km = max(0.0, distance_m) / 1000.0
    penalty = 0.0
    if unit_deficit > 0:
        shortfall = max(0.0, unit_deficit - max(0.0, truck_fuel))
        penalty = (shortfall / unit_deficit) * _SHORTFALL_WEIGHT
    return km + penalty


def assign_trucks(
    units: Sequence[UnitInstance], trucks: Sequence[UnitInstance]
) -> list[tuple[str, str, float]]:
    """Assign trucks to units. Returns ``[(unit_id, truck_id, cost)]`` for the served units."""
    if not units or not trucks:
        return []

    catalog = build_unit_provider()

    def fuel_type(inst: UnitInstance) -> str | None:
        ut = catalog.get_unit(inst.unit_type_id)
        return ut.fuel.fuel_type.value if ut is not None else None

    def capacity(inst: UnitInstance) -> float:
        ut = catalog.get_unit(inst.unit_type_id)
        return ut.fuel.capacity_liters if ut is not None else 0.0

    u, t = len(units), len(trucks)
    n = max(u, t)
    solver = linear_sum_assignment.SimpleLinearSumAssignment()
    for i in range(n):
        for j in range(n):
            cost = _BIG
            if i < u and j < t:
                unit, truck = units[i], trucks[j]
                truck_fuel = truck.current_fuel_liters or 0.0
                compatible = fuel_type(unit) == fuel_type(truck) and truck_fuel > 0
                if compatible:
                    deficit = max(0.0, capacity(unit) - (unit.current_fuel_liters or 0.0))
                    dist = haversine_m(unit.lon, unit.lat, truck.lon, truck.lat)
                    cost = round(refuel_cost(dist, truck_fuel, deficit) * _SCALE)
            solver.add_arc_with_cost(i, j, cost)

    if solver.solve() != solver.OPTIMAL:
        return []

    out: list[tuple[str, str, float]] = []
    for i in range(u):
        j = solver.right_mate(i)
        if j < t and solver.assignment_cost(i) < _BIG:
            out.append((units[i].id, trucks[j].id, solver.assignment_cost(i) / _SCALE))
    return out
