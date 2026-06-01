"""OR-Tools fuel redistribution (Wave 6 Feature 3: redistribution-optimizer).

Per fuel type, depots above a target fill are sources and depots below are sinks; a min-cost flow
(``SimpleMinCostFlow``) computes the cheapest distance-weighted transfers, with a dummy node
balancing supply vs. demand. Deficit no depot can cover becomes a ``buy`` move. Pure: takes domain
objects, returns ``RedistributionMove``s.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass

from ortools.graph.python import min_cost_flow

from app.domain.supply import FuelDepot, FuelStock
from app.services.sim import haversine_m

_BUY_UNIT_COST = 1000  # km-equivalent: real transfers always beat buying when a source exists
_MIN_LITERS = 1  # ignore negligible moves


@dataclass(frozen=True)
class RedistributionMove:
    kind: str  # "transfer" | "buy"
    fuel_type: str
    to_depot: str
    liters: int
    cost: float
    from_depot: str | None = None


def _km(a: FuelDepot, b: FuelDepot) -> int:
    return max(0, round(haversine_m(a.lon, a.lat, b.lon, b.lat) / 1000.0))


def redistribution_plan(
    depots: Sequence[FuelDepot],
    stocks: Sequence[FuelStock],
    target_fraction: float = 0.5,
) -> list[RedistributionMove]:
    """Compute distance-minimising transfers (+ buys for uncovered deficit) to hit target fill."""
    by_id = {d.id: d for d in depots}
    by_type: dict[str, list[FuelStock]] = defaultdict(list)
    for s in stocks:
        if s.depot_id in by_id:
            by_type[s.fuel_type.value].append(s)

    moves: list[RedistributionMove] = []
    for fuel_type, rows in by_type.items():
        sources: list[tuple[str, int]] = []  # (depot_id, surplus)
        sinks: list[tuple[str, int]] = []  # (depot_id, deficit)
        for s in rows:
            target = target_fraction * s.capacity_liters
            surplus = round(s.quantity_liters - target)
            if surplus >= _MIN_LITERS:
                sources.append((s.depot_id, surplus))
            elif -surplus >= _MIN_LITERS:
                sinks.append((s.depot_id, -surplus))
        if not sinks:
            continue
        moves.extend(_solve_fuel_type(fuel_type, sources, sinks, by_id))
    return moves


def _solve_fuel_type(
    fuel_type: str,
    sources: list[tuple[str, int]],
    sinks: list[tuple[str, int]],
    by_id: dict[str, FuelDepot],
) -> list[RedistributionMove]:
    total_surplus = sum(q for _, q in sources)
    total_deficit = sum(q for _, q in sinks)

    mcf = min_cost_flow.SimpleMinCostFlow()
    # Node indices: sources 0..S-1, sinks S..S+K-1, dummy at the end.
    s_count = len(sources)
    sink_base = s_count
    dummy = s_count + len(sinks)

    arcs: list[tuple[int, str | None, str | None]] = []  # (arc_id, from_depot, to_depot)
    for i, (src_id, _) in enumerate(sources):
        for j, (sink_id, _) in enumerate(sinks):
            arc = mcf.add_arc_with_capacity_and_unit_cost(
                i, sink_base + j, 10_000_000, _km(by_id[src_id], by_id[sink_id])
            )
            arcs.append((arc, src_id, sink_id))

    if total_surplus > total_deficit:
        # Dummy SINK absorbs leftover surplus (no transfer).
        for i in range(s_count):
            mcf.add_arc_with_capacity_and_unit_cost(i, dummy, 10_000_000, 0)
    elif total_deficit > total_surplus:
        # Dummy SOURCE = buy; high cost so real transfers are preferred.
        for j, (sink_id, _) in enumerate(sinks):
            arc = mcf.add_arc_with_capacity_and_unit_cost(
                dummy, sink_base + j, 10_000_000, _BUY_UNIT_COST
            )
            arcs.append((arc, None, sink_id))

    for i, (_, surplus) in enumerate(sources):
        mcf.set_node_supply(i, surplus)
    for j, (_, deficit) in enumerate(sinks):
        mcf.set_node_supply(sink_base + j, -deficit)
    if total_surplus > total_deficit:
        mcf.set_node_supply(dummy, -(total_surplus - total_deficit))
    elif total_deficit > total_surplus:
        mcf.set_node_supply(dummy, total_deficit - total_surplus)

    if mcf.solve() != mcf.OPTIMAL:
        return []

    out: list[RedistributionMove] = []
    for arc, from_depot, to_depot in arcs:
        flow = mcf.flow(arc)
        if flow < _MIN_LITERS or to_depot is None:
            continue
        unit_cost = mcf.unit_cost(arc)
        if from_depot is None:
            out.append(
                RedistributionMove("buy", fuel_type, to_depot, int(flow), float(flow * unit_cost))
            )
        else:
            out.append(
                RedistributionMove(
                    "transfer", fuel_type, to_depot, int(flow), float(unit_cost), from_depot
                )
            )
    return out
