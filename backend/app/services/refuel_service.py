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
from app.providers.supply import SupplyProvider
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
    recommender: RefuelRecommender | None,
    orders: RefuelOrderProvider,
    *,
    unit_id: str,
    truck_id: str | None = None,
    requested_liters: float | None = None,
) -> RefuelOrder | None:
    """Create a pending refuel order with a truck + rendezvous.

    Normally the truck is chosen by the pluggable recommender. When ``truck_id`` is given (a
    routed fuel run, v2 Wave 12) that truck is used directly — validated as a fuelled
    FUEL_SUPPLY truck whose fuel type matches the unit — with the rendezvous at the unit's
    current position. Returns ``None`` when no compatible fuelled truck is available (or the
    explicit truck is invalid). Raises ``LookupError`` if the unit or its unit type is unknown.
    """
    unit = await instances.get_instance(session, unit_id)
    if unit is None:
        raise LookupError(f"unit instance {unit_id!r} not found")
    unit_type = units.get_unit(unit.unit_type_id)
    if unit_type is None:
        raise LookupError(f"unit type {unit.unit_type_id!r} missing")
    fuel_type = unit_type.fuel.fuel_type

    if truck_id is not None:
        # Explicit truck (routed fuel run): validate it and rendezvous at the unit's position.
        if truck_id == unit.id:
            return None
        truck = await instances.get_instance(session, truck_id)
        truck_type = units.get_unit(truck.unit_type_id) if truck is not None else None
        if (
            truck is None
            or truck_type is None
            or truck_type.nato_unit_type is not NatoUnitType.FUEL_SUPPLY
            or truck_type.fuel.fuel_type is not fuel_type
        ):
            return None
        chosen_truck_id = truck.id
        rdv_lat, rdv_lon, rdv_h3 = unit.lat, unit.lon, unit.h3_index
    else:
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

        if recommender is None:
            return None
        rec = recommender.recommend(unit, candidates)
        if rec is None:
            return None
        chosen_truck_id = rec.truck_id
        rdv_lat, rdv_lon, rdv_h3 = rec.rendezvous.lat, rec.rendezvous.lon, rec.rendezvous.h3_index

    order = RefuelOrder(
        id=uuid.uuid4().hex,
        unit_id=unit.id,
        truck_id=chosen_truck_id,
        fuel_type=fuel_type,
        status=RefuelOrderStatus.PENDING,
        rendezvous_lat=rdv_lat,
        rendezvous_lon=rdv_lon,
        rendezvous_h3=rdv_h3,
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
    truck = await instances.get_instance(session, order.truck_id) if order.truck_id else None
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


async def try_complete_depot_refuel(
    session: AsyncSession,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    supply: SupplyProvider,
    orders: RefuelOrderProvider,
    order: RefuelOrder,
) -> RefuelOrder | None:
    """Depot-sourced refuel (v2 Wave 12 F2): when the unit reaches the depot, fill it from the
    depot's stock and drain that stock. Returns the completed order, or ``None`` if not yet
    co-located / the depot or its stock is missing."""
    if order.depot_id is None:
        return None
    unit = await instances.get_instance(session, order.unit_id)
    depot = await supply.get_depot(session, order.depot_id)
    if unit is None or depot is None:
        return None
    if not co_located(unit.h3_index, depot.h3_index):
        return None

    stock = await supply.get_stock(session, order.depot_id, order.fuel_type)
    available = stock.quantity_liters if stock is not None else 0.0
    unit_type = units.get_unit(unit.unit_type_id)
    capacity = unit_type.fuel.capacity_liters if unit_type is not None else 0.0
    unit_fuel = unit.current_fuel_liters if unit.current_fuel_liters is not None else 0.0

    amount = compute_transfer(unit_fuel, capacity, available, order.requested_liters)
    if amount > 0:
        await instances.set_fuel(session, unit.id, unit_fuel + amount)
        await supply.adjust_stock(session, order.depot_id, order.fuel_type, -amount)
    return await orders.complete(session, order.id, amount)
