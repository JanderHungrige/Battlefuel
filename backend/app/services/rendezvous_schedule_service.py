"""Scheduling, reminders and confirm-launch for rendezvous fuel runs (v2 Wave 13 F2).

A scheduled rendezvous is persisted as a ``RendezvousOrder`` with a countdown (``remaining_game_s``)
that the sim decrements each tick (mirroring buy orders, so it survives restarts). When the
countdown reaches zero the sim fires a reminder and the order flips ``planned → due``; the operator
then confirms-to-launch, which dispatches the pair via F1's ``start_rendezvous``.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.rendezvous import RendezvousOrder, RendezvousOrderStatus
from app.domain.route import RouteMetric, RouteMode, RouteOption
from app.providers.base import UnitDataProvider
from app.providers.move_orders import MoveOrderProvider
from app.providers.refuel_orders import RefuelOrderProvider
from app.providers.rendezvous import RendezvousOrderProvider
from app.providers.routing import RoutingProvider
from app.providers.unit_instances import UnitInstanceProvider
from app.services.rendezvous_service import (
    RendezvousResult,
    plan_rendezvous,
    start_rendezvous,
    valid_refuel_pair,
)


class RendezvousAlreadyResolvedError(Exception):
    """Raised when confirm-launch/cancel targets an order that is already launched or cancelled."""


def _option_for(routes: list[RouteOption], metric: RouteMetric) -> RouteOption:
    """The route option matching ``metric`` (falls back to the first if absent)."""
    for opt in routes:
        if opt.metric is metric:
            return opt
    return routes[0]


async def schedule_rendezvous(
    session: AsyncSession,
    routing: RoutingProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    rendezvous_orders: RendezvousOrderProvider,
    *,
    truck_id: str,
    unit_id: str,
    sector_lat: float,
    sector_lon: float,
    metric: RouteMetric,
    mode: RouteMode,
    scheduled_game_s: float,
) -> RendezvousOrder | None:
    """File a planned rendezvous for ``scheduled_game_s`` game-seconds from now.

    Validates the refuel pair + routability (reusing F1), snapshots the chosen metric's route for
    each mover, and persists a ``planned`` record. Returns ``None`` on an invalid pair / unroutable
    sector (→ 422). Raises ``LookupError`` for an unknown truck/unit (→ 404).
    """
    truck = await instances.get_instance(session, truck_id)
    if truck is None:
        raise LookupError(f"truck {truck_id!r} not found")
    truck_type = units.get_unit(truck.unit_type_id)
    unit = await instances.get_instance(session, unit_id)
    if unit is None:
        raise LookupError(f"unit {unit_id!r} not found")
    unit_type = units.get_unit(unit.unit_type_id)
    if truck_type is None or unit_type is None:
        raise LookupError("unit type missing from catalog")
    if not valid_refuel_pair(truck_id, unit_id, truck_type, unit_type.fuel.fuel_type):
        return None

    plan = await plan_rendezvous(
        session,
        routing,
        instances,
        units,
        truck_id=truck_id,
        unit_id=unit_id,
        sector_lat=sector_lat,
        sector_lon=sector_lon,
        mode=mode,
    )
    if plan is None:
        return None

    truck_opt = _option_for(plan.truck_routes, metric)
    unit_opt = _option_for(plan.unit_routes, metric)
    order = RendezvousOrder(
        id=uuid.uuid4().hex,
        truck_id=truck_id,
        unit_id=unit_id,
        sector_lat=plan.sector_lat,
        sector_lon=plan.sector_lon,
        sector_h3=plan.sector_h3,
        metric=metric,
        mode=mode,
        scheduled_game_s=scheduled_game_s,
        remaining_game_s=scheduled_game_s,
        truck_geometry=truck_opt.geometry,
        unit_geometry=unit_opt.geometry,
        truck_fuel_to_meet=truck_opt.fuel_consumed_l,
        unit_fuel_to_meet=unit_opt.fuel_consumed_l,
        status=RendezvousOrderStatus.PLANNED,
    )
    return await rendezvous_orders.create(session, order)


async def decrement_and_collect_due(
    session: AsyncSession,
    rendezvous_orders: RendezvousOrderProvider,
    dt_game_s: float,
) -> list[RendezvousOrder]:
    """Decrement every planned order's countdown; return the orders that just came due.

    An order that reaches zero is flipped ``planned → due`` (so its reminder fires exactly once).
    """
    due: list[RendezvousOrder] = []
    for order in await rendezvous_orders.list_planned(session):
        new_remaining = order.remaining_game_s - dt_game_s
        if new_remaining <= 0.0:
            await rendezvous_orders.set_remaining(session, order.id, 0.0)
            fired = await rendezvous_orders.set_status(
                session, order.id, RendezvousOrderStatus.DUE
            )
            if fired is not None:
                due.append(fired)
        else:
            await rendezvous_orders.set_remaining(session, order.id, new_remaining)
    return due


async def confirm_launch(
    session: AsyncSession,
    routing: RoutingProvider,
    move_orders: MoveOrderProvider,
    refuel_orders: RefuelOrderProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    rendezvous_orders: RendezvousOrderProvider,
    *,
    order_id: str,
) -> tuple[RendezvousOrder, RendezvousResult] | None:
    """Dispatch a planned/due rendezvous now. ``None`` if no longer routable (→ 422).

    Raises ``LookupError`` (→ 404) for an unknown order and ``RendezvousAlreadyResolvedError``
    (→ 409) if it was already launched or cancelled.
    """
    order = await rendezvous_orders.get(session, order_id)
    if order is None:
        raise LookupError(f"rendezvous order {order_id!r} not found")
    if order.status in (RendezvousOrderStatus.LAUNCHED, RendezvousOrderStatus.CANCELLED):
        raise RendezvousAlreadyResolvedError(order.status.value)

    result = await start_rendezvous(
        session,
        routing,
        move_orders,
        refuel_orders,
        instances,
        units,
        truck_id=order.truck_id,
        unit_id=order.unit_id,
        sector_lat=order.sector_lat,
        sector_lon=order.sector_lon,
        metric=order.metric,
        mode=order.mode,
    )
    if result is None:
        return None
    launched = await rendezvous_orders.set_status(
        session, order_id, RendezvousOrderStatus.LAUNCHED
    )
    return (launched or order), result


async def cancel_rendezvous(
    session: AsyncSession,
    rendezvous_orders: RendezvousOrderProvider,
    order_id: str,
) -> RendezvousOrder:
    """Cancel a planned/due rendezvous. Raises ``LookupError`` (404) / already-resolved (409)."""
    order = await rendezvous_orders.get(session, order_id)
    if order is None:
        raise LookupError(f"rendezvous order {order_id!r} not found")
    if order.status in (RendezvousOrderStatus.LAUNCHED, RendezvousOrderStatus.CANCELLED):
        raise RendezvousAlreadyResolvedError(order.status.value)
    cancelled = await rendezvous_orders.set_status(
        session, order_id, RendezvousOrderStatus.CANCELLED
    )
    return cancelled or order
