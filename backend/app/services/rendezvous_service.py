"""Rendezvous fuel run: route BOTH movers to a sector and wire the refuel (v2 Wave 13 F1).

A *rendezvous* generalises the Wave-12 routed fuel run (one mover → a fixed point) to a meeting
at a **sector**: given a tanker, a target unit, and a sector, plan Safe+Fast routes for both
movers to the sector centre, then on "order now" dispatch the pair plus a refuel order. The
existing co-located transfer (``try_complete_refuel``) fires when both reach the sector cell.

The theater grid is H3 (no MGRS): a clicked sector point is snapped to its H3 cell and both
movers route to that cell's centre, so co-location is guaranteed on arrival. Each mover's
*fuel-to-meet* is the chosen metric's ``RouteOption.fuel_consumed_l`` — already computed by the
planner; this layer only surfaces it.
"""

from __future__ import annotations

import uuid

import h3
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.refuel import RefuelOrder, RefuelOrderStatus
from app.domain.route import RouteMetric, RouteMode, RouteOption
from app.domain.unit import NatoUnitType
from app.providers.base import UnitDataProvider
from app.providers.move_orders import MoveOrderProvider
from app.providers.refuel_orders import RefuelOrderProvider
from app.providers.routing import RoutingProvider
from app.providers.unit_instances import UnitInstanceProvider
from app.services.move_order_service import create_move_order
from app.services.route_planner import plan_routes
from app.services.tile_grid import DEFAULT_RESOLUTION, cell_center


def resolve_sector(lat: float, lon: float) -> tuple[float, float, str]:
    """Snap a clicked point to its H3 cell; return the cell centre ``(lat, lon)`` + the cell id."""
    cell = h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION)
    clat, clon = cell_center(cell)
    return clat, clon, cell


class RendezvousPlan:
    """Both movers' Safe/Fast options to the sector (each option carries fuel-to-meet)."""

    def __init__(
        self,
        sector_lat: float,
        sector_lon: float,
        sector_h3: str,
        truck_routes: list[RouteOption],
        unit_routes: list[RouteOption],
    ) -> None:
        self.sector_lat = sector_lat
        self.sector_lon = sector_lon
        self.sector_h3 = sector_h3
        self.truck_routes = truck_routes
        self.unit_routes = unit_routes


class RendezvousResult:
    """The three orders an "order now" rendezvous starts, plus the resolved sector."""

    def __init__(
        self,
        sector_lat: float,
        sector_lon: float,
        sector_h3: str,
        truck_move_order: MoveOrder,
        unit_move_order: MoveOrder,
        refuel_order: RefuelOrder,
    ) -> None:
        self.sector_lat = sector_lat
        self.sector_lon = sector_lon
        self.sector_h3 = sector_h3
        self.truck_move_order = truck_move_order
        self.unit_move_order = unit_move_order
        self.refuel_order = refuel_order


def valid_refuel_pair(truck_id: str, unit_id: str, truck_type: object, fuel_type: object) -> bool:
    """The truck must be a FUEL_SUPPLY of the unit's fuel type, and not the unit itself."""
    return (
        truck_id != unit_id
        and getattr(truck_type, "nato_unit_type", None) is NatoUnitType.FUEL_SUPPLY
        and truck_type.fuel.fuel_type is fuel_type  # type: ignore[attr-defined]
    )


async def plan_rendezvous(
    session: AsyncSession,
    routing: RoutingProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    *,
    truck_id: str,
    unit_id: str,
    sector_lat: float,
    sector_lon: float,
    mode: RouteMode = RouteMode.ROAD,
) -> RendezvousPlan | None:
    """Plan Safe+Fast routes for both movers to the sector. ``None`` if either is unroutable.

    Raises ``LookupError`` for an unknown truck/unit or a missing unit type (→ 404).
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

    s_lat, s_lon, s_h3 = resolve_sector(sector_lat, sector_lon)
    truck_routes = await plan_routes(session, routing, truck, truck_type, s_lat, s_lon, mode=mode)
    unit_routes = await plan_routes(session, routing, unit, unit_type, s_lat, s_lon, mode=mode)
    if not truck_routes or not unit_routes:
        return None
    return RendezvousPlan(s_lat, s_lon, s_h3, truck_routes, unit_routes)


async def start_rendezvous(
    session: AsyncSession,
    routing: RoutingProvider,
    move_orders: MoveOrderProvider,
    refuel_orders: RefuelOrderProvider,
    instances: UnitInstanceProvider,
    units: UnitDataProvider,
    *,
    truck_id: str,
    unit_id: str,
    sector_lat: float,
    sector_lon: float,
    metric: RouteMetric,
    mode: RouteMode = RouteMode.ROAD,
) -> RendezvousResult | None:
    """Dispatch both movers to the sector and wire the unit↔truck refuel ("order now").

    All three orders (truck move, unit move, refuel) are created and activated together. Returns
    ``None`` if a mover is unroutable or the refuel linkage is invalid; any already-created move
    order is rolled back. Raises ``LookupError`` for an unknown truck/unit (→ 404).
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

    fuel_type = unit_type.fuel.fuel_type
    if not valid_refuel_pair(truck_id, unit_id, truck_type, fuel_type):
        return None

    s_lat, s_lon, s_h3 = resolve_sector(sector_lat, sector_lon)
    truck_move = await create_move_order(
        session, routing, move_orders, truck, truck_type, s_lat, s_lon, metric, mode=mode
    )
    if truck_move is None:
        return None
    unit_move = await create_move_order(
        session, routing, move_orders, unit, unit_type, s_lat, s_lon, metric, mode=mode
    )
    if unit_move is None:
        await move_orders.set_status(session, truck_move.id, MoveOrderStatus.CANCELLED)
        return None

    refuel: RefuelOrder | None = await refuel_orders.create(
        session,
        RefuelOrder(
            id=uuid.uuid4().hex,
            unit_id=unit_id,
            truck_id=truck_id,
            depot_id=None,
            fuel_type=fuel_type,
            status=RefuelOrderStatus.PENDING,
            rendezvous_lat=s_lat,
            rendezvous_lon=s_lon,
            rendezvous_h3=s_h3,
        ),
    )
    if refuel is None:
        await move_orders.set_status(session, truck_move.id, MoveOrderStatus.CANCELLED)
        await move_orders.set_status(session, unit_move.id, MoveOrderStatus.CANCELLED)
        return None

    truck_move = (
        await move_orders.set_status(session, truck_move.id, MoveOrderStatus.ACTIVE) or truck_move
    )
    unit_move = (
        await move_orders.set_status(session, unit_move.id, MoveOrderStatus.ACTIVE) or unit_move
    )
    refuel = (
        await refuel_orders.set_status(session, refuel.id, RefuelOrderStatus.ACTIVE) or refuel
    )
    return RendezvousResult(s_lat, s_lon, s_h3, truck_move, unit_move, refuel)
