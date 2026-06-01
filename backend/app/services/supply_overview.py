"""Build the OF-8 fuel distribution overview (Wave 5 Feature 2: supply-stock-api).

Joins fixed-depot stock (from the supply provider) with the fuel carried by mobile fuel
trucks — placed ``UnitInstance``s whose ``UnitType.nato_unit_type`` is ``FUEL_SUPPLY``. All
data is obtained through the factories; this module never queries tables directly.
"""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.supply import DepotFuel, SupplyOverview, TruckFuel
from app.domain.unit import NatoUnitType
from app.providers.base import UnitDataProvider
from app.providers.supply import SupplyProvider
from app.providers.unit_instances import UnitInstanceProvider


async def build_supply_overview(
    session: AsyncSession,
    supply: SupplyProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
) -> SupplyOverview:
    """Assemble depot stock + mobile-truck fuel into a single distribution view."""
    depots = await supply.list_depots(session)
    all_stocks = await supply.list_stocks(session)

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
