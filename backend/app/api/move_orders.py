"""Move-order endpoints (Wave 3, move-orders). Mounted under /api/v1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.route import RouteMetric, RouteMode
from app.providers.factory import build_unit_provider
from app.providers.move_orders import MoveOrderProvider, build_move_order_provider
from app.providers.routing import RoutingProvider, build_routing_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.move_order_service import create_move_order

router = APIRouter(tags=["move-orders"])


def get_routing_provider() -> RoutingProvider:
    return build_routing_provider()


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def get_order_provider() -> MoveOrderProvider:
    return build_move_order_provider()


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


@router.get("/move-orders")
async def list_orders(session: SessionDep, orders: OrderDep) -> list[MoveOrder]:
    return list(await orders.list_all(session))


@router.get("/move-orders/{order_id}")
async def get_order(order_id: str, session: SessionDep, orders: OrderDep) -> MoveOrder:
    order = await orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"move order {order_id!r} not found")
    return order
