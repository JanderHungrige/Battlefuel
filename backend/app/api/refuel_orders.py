"""Refuel-order endpoints (Wave 5 Feature 3: refuel-orders). Mounted under /api/v1.

Creating an order runs the pluggable recommender (closest compatible fuel truck) and records a
rendezvous. The operator then moves the truck manually; the sim completes the transfer when the
two are co-located.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.refuel import RefuelOrder, RefuelOrderStatus
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.refuel_orders import RefuelOrderProvider, build_refuel_order_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.refuel_recommender import RefuelRecommender, build_refuel_recommender
from app.services.refuel_service import create_refuel_order

router = APIRouter(tags=["refuel-orders"])


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def get_unit_provider() -> UnitDataProvider:
    return build_unit_provider()


def get_order_provider() -> RefuelOrderProvider:
    return build_refuel_order_provider()


def get_recommender() -> RefuelRecommender:
    return build_refuel_recommender()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
InstanceDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]
UnitDep = Annotated[UnitDataProvider, Depends(get_unit_provider)]
OrderDep = Annotated[RefuelOrderProvider, Depends(get_order_provider)]
RecommenderDep = Annotated[RefuelRecommender, Depends(get_recommender)]


class CreateRefuelOrderRequest(BaseModel):
    unit_id: str
    requested_liters: float | None = Field(default=None, ge=0)


@router.post("/refuel-orders", status_code=201)
async def create_order(
    req: CreateRefuelOrderRequest,
    session: SessionDep,
    instances: InstanceDep,
    units: UnitDep,
    recommender: RecommenderDep,
    orders: OrderDep,
) -> RefuelOrder:
    """Recommend a fuel truck + rendezvous and create a pending refuel order."""
    try:
        order = await create_refuel_order(
            session,
            instances,
            units,
            recommender,
            orders,
            unit_id=req.unit_id,
            requested_liters=req.requested_liters,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if order is None:
        raise HTTPException(status_code=422, detail="no compatible fuel truck available")
    return order


@router.post("/refuel-orders/{order_id}/confirm")
async def confirm_order(order_id: str, session: SessionDep, orders: OrderDep) -> RefuelOrder:
    order = await orders.set_status(session, order_id, RefuelOrderStatus.ACTIVE)
    if order is None:
        raise HTTPException(status_code=404, detail=f"refuel order {order_id!r} not found")
    return order


@router.post("/refuel-orders/{order_id}/cancel")
async def cancel_order(order_id: str, session: SessionDep, orders: OrderDep) -> RefuelOrder:
    order = await orders.set_status(session, order_id, RefuelOrderStatus.CANCELLED)
    if order is None:
        raise HTTPException(status_code=404, detail=f"refuel order {order_id!r} not found")
    return order


@router.get("/refuel-orders")
async def list_orders(session: SessionDep, orders: OrderDep) -> list[RefuelOrder]:
    return list(await orders.list_all(session))


@router.get("/refuel-orders/{order_id}")
async def get_order(order_id: str, session: SessionDep, orders: OrderDep) -> RefuelOrder:
    order = await orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"refuel order {order_id!r} not found")
    return order
