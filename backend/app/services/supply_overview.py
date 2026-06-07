"""Build the OF-8 fuel distribution overview (Wave 5 Feature 2: supply-stock-api).

Joins fixed-depot stock (from the supply provider) with the fuel carried by mobile fuel
trucks — placed ``UnitInstance``s whose ``UnitType.nato_unit_type`` is ``FUEL_SUPPLY``. All
data is obtained through the factories; this module never queries tables directly.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.refuel import RefuelOrderStatus
from app.domain.supply import DepotFuel, SupplyOverview, TruckFuel
from app.domain.unit import NatoUnitType
from app.providers.base import UnitDataProvider
from app.providers.refuel_orders import RefuelOrderProvider
from app.providers.supply import SupplyProvider
from app.providers.unit_instances import UnitInstanceProvider

# A truck with a refuel order in one of these states is tasked (not on standby).
_OPEN_REFUEL = (RefuelOrderStatus.PENDING, RefuelOrderStatus.ACTIVE)


async def build_supply_overview(
    session: AsyncSession,
    supply: SupplyProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    refuel_orders: RefuelOrderProvider | None = None,
) -> SupplyOverview:
    """Assemble depot stock + mobile-truck fuel into a single distribution view.

    When ``refuel_orders`` is supplied, each truck is tagged with the unit it is tasked to
    refuel via an open (pending/active) order — else it is on standby (v2 Wave 11 supply fleet).
    """
    depots = await supply.list_depots(session)
    all_stocks = await supply.list_stocks(session)

    # Map truck_id → unit_id for trucks tasked by an open refuel order.
    tasked: dict[str, str] = {}
    if refuel_orders is not None:
        for order in await refuel_orders.list_all(session):
            if order.status in _OPEN_REFUEL and order.truck_id is not None:
                tasked[order.truck_id] = order.unit_id

    stocks_by_depot = defaultdict(list)
    for stock in all_stocks:
        stocks_by_depot[stock.depot_id].append(stock)
    depot_fuel = [DepotFuel(depot=d, stocks=stocks_by_depot.get(d.id, [])) for d in depots]

    totals_by_type: dict[str, float] = defaultdict(float)
    for stock in all_stocks:
        totals_by_type[stock.fuel_type.value] += stock.quantity_liters

    trucks: list[TruckFuel] = []
    total_truck_liters = 0.0
    for inst in await instances.list_instances(session):
        unit_type = units.get_unit(inst.unit_type_id)
        if unit_type is None or unit_type.nato_unit_type is not NatoUnitType.FUEL_SUPPLY:
            continue
        trucks.append(
            TruckFuel(
                instance_id=inst.id,
                name=inst.name,
                unit_type_id=inst.unit_type_id,
                fuel_type=unit_type.fuel.fuel_type,
                current_fuel_liters=inst.current_fuel_liters,
                capacity_liters=unit_type.fuel.capacity_liters,
                lat=inst.lat,
                lon=inst.lon,
                h3_index=inst.h3_index,
                assigned_unit_id=tasked.get(inst.id),
            )
        )
        if inst.current_fuel_liters is not None:
            total_truck_liters += inst.current_fuel_liters

    return SupplyOverview(
        depots=depot_fuel,
        trucks=trucks,
        total_depot_liters_by_type=dict(totals_by_type),
        total_truck_liters=total_truck_liters,
    )
