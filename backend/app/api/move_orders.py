"""Move-order endpoints (Wave 3, move-orders). Mounted under /api/v1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.refuel import RefuelOrder
from app.domain.route import RouteMetric, RouteMode
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.move_orders import MoveOrderProvider, build_move_order_provider
from app.providers.refuel_orders import RefuelOrderProvider, build_refuel_order_provider
from app.providers.routing import RoutingProvider, build_routing_provider
from app.providers.tiles import TileDataProvider, build_tile_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.move_order_service import create_move_order, create_move_order_waypoints
from app.services.move_refuel_service import plan_move_refuel_options, plan_move_with_refuel

router = APIRouter(tags=["move-orders"])


def get_routing_provider() -> RoutingProvider:
    return build_routing_provider()


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def get_order_provider() -> MoveOrderProvider:
    return build_move_order_provider()


def get_refuel_order_provider() -> RefuelOrderProvider:
    return build_refuel_order_provider()


def get_unit_data_provider() -> UnitDataProvider:
    return build_unit_provider()


def get_tile_provider() -> TileDataProvider:
    return build_tile_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
RoutingDep = Annotated[RoutingProvider, Depends(get_routing_provider)]
InstanceDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]
OrderDep = Annotated[MoveOrderProvider, Depends(get_order_provider)]


class CreateMoveOrderRequest(BaseModel):
    instance_id: str
    dest_lat: float
    dest_lon: float
    metric: RouteMetric = RouteMetric.FAST
    mode: RouteMode = RouteMode.ROAD


@router.post("/move-orders", status_code=201)
async def create_order(
    req: CreateMoveOrderRequest,
    session: SessionDep,
    routing: RoutingDep,
    instances: InstanceDep,
    orders: OrderDep,
) -> MoveOrder:
    """Plan the chosen route and create a pending move order for the unit."""
    instance = await instances.get_instance(session, req.instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {req.instance_id!r} not found")
    unit_type = build_unit_provider().get_unit(instance.unit_type_id)
    if unit_type is None:
        raise HTTPException(status_code=409, detail=f"unit type {instance.unit_type_id!r} missing")
    order = await create_move_order(
        session,
        routing,
        orders,
        instance,
        unit_type,
        req.dest_lat,
        req.dest_lon,
        req.metric,
        mode=req.mode,
    )
    if order is None:
        raise HTTPException(status_code=422, detail="no route to destination")
    return order


class Waypoint(BaseModel):
    lat: float
    lon: float
    mode: RouteMode | None = None  # per-leg travel mode (v2 W16 F3); falls back to the request mode


class CreateWaypointMoveOrderRequest(BaseModel):
    instance_id: str
    waypoints: list[Waypoint]
    metric: RouteMetric = RouteMetric.FAST
    mode: RouteMode = RouteMode.ROAD


@router.post("/move-orders/waypoints", status_code=201)
async def create_waypoint_order(
    req: CreateWaypointMoveOrderRequest,
    session: SessionDep,
    routing: RoutingDep,
    instances: InstanceDep,
    orders: OrderDep,
) -> MoveOrder:
    """Create a pending move order from an ordered waypoint route (v2 Wave 10, waypoint-routing)."""
    if not req.waypoints:
        raise HTTPException(status_code=422, detail="at least one waypoint is required")
    instance = await instances.get_instance(session, req.instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {req.instance_id!r} not found")
    unit_type = build_unit_provider().get_unit(instance.unit_type_id)
    if unit_type is None:
        raise HTTPException(status_code=409, detail=f"unit type {instance.unit_type_id!r} missing")
    order = await create_move_order_waypoints(
        session,
        routing,
        orders,
        instance,
        unit_type,
        [(w.lat, w.lon) for w in req.waypoints],
        req.metric,
        mode=req.mode,
        modes=[w.mode or req.mode for w in req.waypoints],
    )
    if order is None:
        raise HTTPException(status_code=422, detail="no route through the given waypoints")
    return order


@router.post("/move-orders/{order_id}/confirm")
async def confirm_order(order_id: str, session: SessionDep, orders: OrderDep) -> MoveOrder:
    """Confirm a pending order → active (the sim engine will advance it)."""
    order = await orders.set_status(session, order_id, MoveOrderStatus.ACTIVE)
    if order is None:
        raise HTTPException(status_code=404, detail=f"move order {order_id!r} not found")
    return order


@router.post("/move-orders/{order_id}/cancel")
async def cancel_order(order_id: str, session: SessionDep, orders: OrderDep) -> MoveOrder:
    """Cancel an order."""
    order = await orders.set_status(session, order_id, MoveOrderStatus.CANCELLED)
    if order is None:
        raise HTTPException(status_code=404, detail=f"move order {order_id!r} not found")
    return order


@router.post("/move-orders/{order_id}/proceed")
async def proceed_order(order_id: str, session: SessionDep, orders: OrderDep) -> MoveOrder:
    """Operator opts a halted order into "proceed slowly" → crossing.

    The sim then crawls the unit across the obstruction at a penalty and resumes normal
    movement once it reaches a passable, sub-threat tile. Only a halted order may proceed.
    """
    order = await orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"move order {order_id!r} not found")
    if order.status is not MoveOrderStatus.HALTED:
        raise HTTPException(
            status_code=409,
            detail=f"move order {order_id!r} is {order.status.value}, not halted",
        )
    updated = await orders.set_status(session, order_id, MoveOrderStatus.CROSSING)
    assert updated is not None  # existence just checked above
    return updated


@router.post("/move-orders/{order_id}/continue")
async def continue_order(order_id: str, session: SessionDep, orders: OrderDep) -> MoveOrder:
    """Operator opts a halted order into "Continue" → continuing (cross the threat at normal speed).

    Unlike "proceed slowly" (a crawl penalty), this crosses the current threat tile at normal
    speed and reverts to active once clear, so the next threat tile re-prompts. Only a halted
    order may continue (v2 Wave 13 F5)."""
    order = await orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"move order {order_id!r} not found")
    if order.status is not MoveOrderStatus.HALTED:
        raise HTTPException(
            status_code=409,
            detail=f"move order {order_id!r} is {order.status.value}, not halted",
        )
    updated = await orders.set_status(session, order_id, MoveOrderStatus.CONTINUING)
    assert updated is not None
    return updated


class MoveRefuelOptionsRequest(BaseModel):
    instance_id: str
    dest_lat: float
    dest_lon: float
    metric: RouteMetric = RouteMetric.SAFE
    mode: RouteMode = RouteMode.ROAD


class MoveRefuelOptionView(BaseModel):
    truck_id: str
    truck_name: str
    sector_lat: float
    sector_lon: float
    sector_h3: str
    unit_geometry: list[list[float]]
    tanker_geometry: list[list[float]]
    unit_fuel_l: float
    tanker_fuel_l: float
    threat_max: int


class MoveWithRefuelRequest(BaseModel):
    instance_id: str
    dest_lat: float
    dest_lon: float
    metric: RouteMetric = RouteMetric.SAFE
    mode: RouteMode = RouteMode.ROAD
    # The tanker the operator chose from the options; nearest compatible if omitted.
    truck_id: str | None = None


class _RefuelSector(BaseModel):
    lat: float
    lon: float
    h3: str


class MoveWithRefuelResponse(BaseModel):
    rendezvous: _RefuelSector
    unit_move_order: MoveOrder
    tanker_move_order: MoveOrder
    refuel_order: RefuelOrder


@router.post("/move-orders/refuel-options")
async def move_refuel_options(
    req: MoveRefuelOptionsRequest,
    session: SessionDep,
    routing: RoutingDep,
    instances: InstanceDep,
    units: Annotated[UnitDataProvider, Depends(get_unit_data_provider)],
    tiles: Annotated[TileDataProvider, Depends(get_tile_provider)],
) -> list[MoveRefuelOptionView]:
    """Preview the nearest refuel-stop choices (per tanker) for the operator to click through — no
    dispatch (v2 W13 correction)."""
    try:
        options = await plan_move_refuel_options(
            session,
            routing,
            instances,
            units,
            tiles,
            instance_id=req.instance_id,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
            metric=req.metric,
            mode=req.mode,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return [
        MoveRefuelOptionView(
            truck_id=o.truck_id,
            truck_name=o.truck_name,
            sector_lat=o.sector_lat,
            sector_lon=o.sector_lon,
            sector_h3=o.sector_h3,
            unit_geometry=o.unit_geometry,
            tanker_geometry=o.tanker_geometry,
            unit_fuel_l=o.unit_fuel_l,
            tanker_fuel_l=o.tanker_fuel_l,
            threat_max=o.threat_max,
        )
        for o in options
    ]


@router.post("/move-orders/with-refuel", status_code=201)
async def move_with_refuel(
    req: MoveWithRefuelRequest,
    session: SessionDep,
    routing: RoutingDep,
    orders: OrderDep,
    instances: InstanceDep,
    refuel_orders: Annotated[RefuelOrderProvider, Depends(get_refuel_order_provider)],
    units: Annotated[UnitDataProvider, Depends(get_unit_data_provider)],
    tiles: Annotated[TileDataProvider, Depends(get_tile_provider)],
) -> MoveWithRefuelResponse:
    """Plan a move with a refuel stop on the way: nearest tanker, rendezvous nudged out of threat,
    stitched into the unit's route (unit → rendezvous → dest) + tanker dispatched (v2 W13 F6)."""
    try:
        result = await plan_move_with_refuel(
            session,
            routing,
            orders,
            refuel_orders,
            instances,
            units,
            tiles,
            instance_id=req.instance_id,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
            metric=req.metric,
            mode=req.mode,
            truck_id=req.truck_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(
            status_code=422,
            detail="no compatible tanker available, or the route is not possible",
        )
    return MoveWithRefuelResponse(
        rendezvous=_RefuelSector(lat=result.sector_lat, lon=result.sector_lon, h3=result.sector_h3),
        unit_move_order=result.unit_move_order,
        tanker_move_order=result.tanker_move_order,
        refuel_order=result.refuel_order,
    )


@router.get("/move-orders")
async def list_orders(session: SessionDep, orders: OrderDep) -> list[MoveOrder]:
    return list(await orders.list_all(session))


@router.get("/move-orders/{order_id}")
async def get_order(order_id: str, session: SessionDep, orders: OrderDep) -> MoveOrder:
    order = await orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"move order {order_id!r} not found")
    return order
