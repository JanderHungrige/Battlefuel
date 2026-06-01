"""Refuel order creation + co-located transfer (Wave 5 Feature 3: refuel-orders).

``compute_transfer`` and ``co_located`` are pure (deterministic unit tests). ``create_refuel_order``
selects a truck via the pluggable recommender; ``try_complete_refuel`` performs the transfer once
the unit and its truck share a cell.
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.refuel import RefuelOrder, RefuelOrderStatus
from app.domain.unit import NatoUnitType
from app.providers.base import UnitDataProvider
from app.providers.refuel_orders import RefuelOrderProvider
from app.providers.unit_instances import UnitInstanceProvider
from app.services.refuel_recommender import RefuelRecommender


def compute_transfer(
    unit_fuel: float,
    unit_capacity: float,
    truck_fuel: float,
    requested_liters: float | None = None,
) -> float:
    """Litres to move: clamped to unit headroom, available truck fuel, and any request cap."""
    headroom = max(0.0, unit_capacity - unit_fuel)
    want = headroom if requested_liters is None else min(headroom, max(0.0, requested_liters))
    return max(0.0, min(want, max(0.0, truck_fuel)))


def co_located(unit_h3: str, truck_h3: str) -> bool:
    """True when both occupy the same (non-empty) H3 cell."""
    return bool(unit_h3) and unit_h3 == truck_h3


async def create_refuel_order(
    session: AsyncSession,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    recommender: RefuelRecommender,
    orders: RefuelOrderProvider,
    *,
    unit_id: str,
    requested_liters: float | None = None,
) -> RefuelOrder | None:
    """Create a pending refuel order with a recommended truck + rendezvous.

    Returns ``None`` when no compatible fuelled truck is available. Raises ``LookupError`` if the
    unit or its unit type is unknown (the API maps these to 404 / 409).
    """
    unit = await instances.get_instance(session, unit_id)
    if unit is None:
        raise LookupError(f"unit instance {unit_id!r} not found")
    unit_type = units.get_unit(unit.unit_type_id)
    if unit_type is None:
        raise LookupError(f"unit type {unit.unit_type_id!r} missing")
    fuel_type = unit_type.fuel.fuel_type

    candidates = []
    for inst in await instances.list_instances(session):
        if inst.id == unit.id:
            continue
        truck_type = units.get_unit(inst.unit_type_id)
        if truck_type is None or truck_type.nato_unit_type is not NatoUnitType.FUEL_SUPPLY:
            continue
        if truck_type.fuel.fuel_type is not fuel_type:
            continue
        candidates.append(inst)

    rec = recommender.recommend(unit, candidates)
    if rec is None:
        return None

    order = RefuelOrder(
        id=uuid.uuid4().hex,
        unit_id=unit.id,
        truck_id=rec.truck_id,
        fuel_type=fuel_type,
        status=RefuelOrderStatus.PENDING,
        rendezvous_lat=rec.rendezvous.lat,
        rendezvous_lon=rec.rendezvous.lon,
        rendezvous_h3=rec.rendezvous.h3_index,
        requested_liters=requested_liters,
    )
    return await orders.create(session, order)


async def try_complete_refuel(
    session: AsyncSession,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    orders: RefuelOrderProvider,
    order: RefuelOrder,
) -> RefuelOrder | None:
    """If the unit and truck are co-located, transfer fuel and complete the order.

    Returns the completed order, or ``None`` if not yet co-located (or an endpoint is missing).
    """
    unit = await instances.get_instance(session, order.unit_id)
    truck = await instances.get_instance(session, order.truck_id)
    if unit is None or truck is None:
        return None
    if not co_located(unit.h3_index, truck.h3_index):
        return None

    unit_type = units.get_unit(unit.unit_type_id)
    capacity = unit_type.fuel.capacity_liters if unit_type is not None else 0.0
    unit_fuel = unit.current_fuel_liters if unit.current_fuel_liters is not None else 0.0
    truck_fuel = truck.current_fuel_liters if truck.current_fuel_liters is not None else 0.0

    amount = compute_transfer(unit_fuel, capacity, truck_fuel, order.requested_liters)
    if amount > 0:
        await instances.set_fuel(session, unit.id, unit_fuel + amount)
        await instances.set_fuel(session, truck.id, truck_fuel - amount)
    return await orders.complete(session, order.id, amount)
