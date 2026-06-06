"""Routed fuel run: dispatch a mover along a chosen route and wire the refuel (v2 Wave 12).

A fuel run combines a move order (the mover routes to the target) with a refuel order (so the
existing co-located transfer fires on arrival). In Wave 12 F1 the mover is a fuel truck routing
to a thirsty unit; the truck is used explicitly (no recommender). Reuses ``create_move_order``
(Safe/Fast routing, never-stall sim movement) and ``create_refuel_order``.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.refuel import RefuelOrder, RefuelOrderStatus
from app.domain.route import RouteMetric, RouteMode
from app.providers.base import UnitDataProvider
from app.providers.move_orders import MoveOrderProvider
from app.providers.refuel_orders import RefuelOrderProvider
from app.providers.routing import RoutingProvider
from app.providers.unit_instances import UnitInstanceProvider
from app.services.move_order_service import create_move_order
from app.services.refuel_service import create_refuel_order


class FuelRunResult:
    """The two orders a fuel run starts: the mover's move order + the refuel order."""

    def __init__(self, move_order: MoveOrder, refuel_order: RefuelOrder) -> None:
        self.move_order = move_order
        self.refuel_order = refuel_order


async def start_fuel_run(
    session: AsyncSession,
    routing: RoutingProvider,
    move_orders: MoveOrderProvider,
    refuel_orders: RefuelOrderProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    *,
    mover_id: str,
    unit_id: str,
    truck_id: str,
    dest_lat: float,
    dest_lon: float,
    metric: RouteMetric,
    mode: RouteMode = RouteMode.ROAD,
) -> FuelRunResult | None:
    """Route the mover to ``(dest_lat, dest_lon)`` and wire the unit↔truck refuel.

    Both orders are created and activated. Returns ``None`` if the mover is unroutable or no
    valid refuel linkage can be made (the API maps these to 422). Raises ``LookupError`` for an
    unknown mover/unit (→ 404).
    """
    mover = await instances.get_instance(session, mover_id)
    if mover is None:
        raise LookupError(f"mover {mover_id!r} not found")
    mover_type = units.get_unit(mover.unit_type_id)
    if mover_type is None:
        raise LookupError(f"unit type {mover.unit_type_id!r} missing")

    move = await create_move_order(
        session, routing, move_orders, mover, mover_type, dest_lat, dest_lon, metric, mode=mode
    )
    if move is None:
        return None
    refuel = await create_refuel_order(
        session,
        instances,
        units,
        recommender=None,  # explicit truck → recommender unused
        orders=refuel_orders,
        unit_id=unit_id,
        truck_id=truck_id,
    )
    if refuel is None:
        # Roll the move order back so we don't dispatch a truck with nothing to deliver.
        await move_orders.set_status(session, move.id, MoveOrderStatus.CANCELLED)
        return None

    move = await move_orders.set_status(session, move.id, MoveOrderStatus.ACTIVE) or move
    refuel = await refuel_orders.set_status(session, refuel.id, RefuelOrderStatus.ACTIVE) or refuel
    return FuelRunResult(move_order=move, refuel_order=refuel)
