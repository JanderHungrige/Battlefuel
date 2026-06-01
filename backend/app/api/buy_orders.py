"""Buy-order endpoints (Wave 5 Feature 4: buy-orders). Mounted under /api/v1.

Procures fuel into a depot; the sim delivers it after a lead time. All depot/stock access goes
through the supply provider.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.domain.buy_order import BuyOrder, BuyOrderStatus
from app.domain.unit import FuelType
from app.providers.buy_orders import BuyOrderProvider, build_buy_order_provider
from app.providers.supply import SupplyProvider, build_supply_provider
from app.services.buy_service import create_buy_order

router = APIRouter(tags=["buy-orders"])


def get_supply_provider() -> SupplyProvider:
    return build_supply_provider()


def get_order_provider() -> BuyOrderProvider:
    return build_buy_order_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SupplyDep = Annotated[SupplyProvider, Depends(get_supply_provider)]
OrderDep = Annotated[BuyOrderProvider, Depends(get_order_provider)]


class CreateBuyOrderRequest(BaseModel):
    depot_id: str
    fuel_type: FuelType
    quantity_liters: float = Field(gt=0)
    lead_time_game_s: float | None = Field(default=None, ge=0)


@router.post("/buy-orders", status_code=201)
async def create_order(
    req: CreateBuyOrderRequest,
    session: SessionDep,
    supply: SupplyDep,
    orders: OrderDep,
) -> BuyOrder:
    """Create a pending buy order procuring fuel into a depot."""
    lead_time = (
        req.lead_time_game_s
        if req.lead_time_game_s is not None
        else get_settings().buy_order_lead_time_game_s
    )
    try:
        order = await create_buy_order(
            session,
            supply,
            orders,
            depot_id=req.depot_id,
            fuel_type=req.fuel_type,
            quantity_liters=req.quantity_liters,
            lead_time_game_s=lead_time,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if order is None:
        raise HTTPException(
            status_code=422,
            detail=f"depot {req.depot_id!r} has no {req.fuel_type.value} stock to replenish",
        )
    return order


@router.post("/buy-orders/{order_id}/confirm")
async def confirm_order(order_id: str, session: SessionDep, orders: OrderDep) -> BuyOrder:
    order = await orders.set_status(session, order_id, BuyOrderStatus.ACTIVE)
    if order is None:
        raise HTTPException(status_code=404, detail=f"buy order {order_id!r} not found")
    return order


@router.post("/buy-orders/{order_id}/cancel")
async def cancel_order(order_id: str, session: SessionDep, orders: OrderDep) -> BuyOrder:
    order = await orders.set_status(session, order_id, BuyOrderStatus.CANCELLED)
    if order is None:
        raise HTTPException(status_code=404, detail=f"buy order {order_id!r} not found")
    return order


@router.get("/buy-orders")
async def list_orders(session: SessionDep, orders: OrderDep) -> list[BuyOrder]:
    return list(await orders.list_all(session))


@router.get("/buy-orders/{order_id}")
async def get_order(order_id: str, session: SessionDep, orders: OrderDep) -> BuyOrder:
    order = await orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"buy order {order_id!r} not found")
    return order
