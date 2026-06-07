"""Fuel-run endpoint (v2 Wave 12): dispatch a mover to a target + wire the refuel. /api/v1.

The frontend first plans Safe/Fast routes via ``POST /routes/plan`` (mover → target), the operator
picks a metric, then this endpoint creates + activates the move order and the refuel order together.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.move_order import MoveOrder
from app.domain.refuel import RefuelOrder
from app.domain.route import RouteMetric, RouteMode
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.move_orders import MoveOrderProvider, build_move_order_provider
from app.providers.refuel_orders import RefuelOrderProvider, build_refuel_order_provider
from app.providers.routing import RoutingProvider, build_routing_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.fuel_run_service import start_fuel_run

router = APIRouter(tags=["fuel-runs"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class CreateFuelRunRequest(BaseModel):
    mover_id: str  # the instance that moves (truck → unit, or the unit → depot)
    unit_id: str  # the unit being refuelled
    # Source: exactly one of truck_id (mobile truck) or depot_id (fixed depot, v2 W12 F2).
    truck_id: str | None = None
    depot_id: str | None = None
    dest_lat: float
    dest_lon: float
    metric: RouteMetric = RouteMetric.SAFE
    mode: RouteMode = RouteMode.ROAD


class FuelRunResponse(BaseModel):
    move_order: MoveOrder
    refuel_order: RefuelOrder


def _routing() -> RoutingProvider:
    return build_routing_provider()


def _move_orders() -> MoveOrderProvider:
    return build_move_order_provider()


def _refuel_orders() -> RefuelOrderProvider:
    return build_refuel_order_provider()


def _instances() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def _units() -> UnitDataProvider:
    return build_unit_provider()


@router.post("/fuel-runs", status_code=201)
async def create_fuel_run(
    req: CreateFuelRunRequest,
    session: SessionDep,
    routing: Annotated[RoutingProvider, Depends(_routing)],
    move_orders: Annotated[MoveOrderProvider, Depends(_move_orders)],
    refuel_orders: Annotated[RefuelOrderProvider, Depends(_refuel_orders)],
    instances: Annotated[UnitInstanceProvider, Depends(_instances)],
    units: Annotated[UnitDataProvider, Depends(_units)],
) -> FuelRunResponse:
    """Start a fuel run: route the mover to the target and activate the refuel."""
    try:
        result = await start_fuel_run(
            session,
            routing,
            move_orders,
            refuel_orders,
            instances,
            units,
            mover_id=req.mover_id,
            unit_id=req.unit_id,
            truck_id=req.truck_id,
            depot_id=req.depot_id,
            dest_lat=req.dest_lat,
            dest_lon=req.dest_lon,
            metric=req.metric,
            mode=req.mode,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(
            status_code=422,
            detail="fuel run not possible (unroutable mover or no compatible fuel truck)",
        )
    return FuelRunResponse(move_order=result.move_order, refuel_order=result.refuel_order)
