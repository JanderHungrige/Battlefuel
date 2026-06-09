"""Rendezvous fuel-run endpoints (v2 Wave 13 F1). Mounted under /api/v1.

``/rendezvous/plan`` returns Safe/Fast route options for BOTH movers (tanker + target unit) to a
chosen sector, each option carrying ``fuel_consumed_l`` (the fuel-to-meet). ``/rendezvous`` is the
"order now" path: it dispatches both movers and the refuel order together (transfer fires on
co-location at the sector).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.move_order import MoveOrder
from app.domain.refuel import RefuelOrder
from app.domain.rendezvous import RendezvousOrder
from app.domain.route import RouteMetric, RouteMode, RouteOption
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.move_orders import MoveOrderProvider, build_move_order_provider
from app.providers.refuel_orders import RefuelOrderProvider, build_refuel_order_provider
from app.providers.rendezvous import RendezvousOrderProvider, build_rendezvous_order_provider
from app.providers.routing import RoutingProvider, build_routing_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.rendezvous_schedule_service import (
    RendezvousAlreadyResolvedError,
    cancel_rendezvous,
    confirm_launch,
    schedule_rendezvous,
)
from app.services.rendezvous_service import plan_rendezvous, start_rendezvous

router = APIRouter(tags=["rendezvous"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class SectorPoint(BaseModel):
    lat: float
    lon: float
    h3: str


class PlanRendezvousRequest(BaseModel):
    truck_id: str
    unit_id: str
    sector_lat: float
    sector_lon: float
    mode: RouteMode = RouteMode.ROAD


class RendezvousPlanResponse(BaseModel):
    sector: SectorPoint
    truck_routes: list[RouteOption]
    unit_routes: list[RouteOption]


class CreateRendezvousRequest(BaseModel):
    truck_id: str
    unit_id: str
    sector_lat: float
    sector_lon: float
    metric: RouteMetric = RouteMetric.SAFE
    mode: RouteMode = RouteMode.ROAD


class RendezvousResponse(BaseModel):
    sector: SectorPoint
    truck_move_order: MoveOrder
    unit_move_order: MoveOrder
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


def _rendezvous_orders() -> RendezvousOrderProvider:
    return build_rendezvous_order_provider()


class ScheduleRendezvousRequest(BaseModel):
    truck_id: str
    unit_id: str
    sector_lat: float
    sector_lon: float
    metric: RouteMetric = RouteMetric.SAFE
    mode: RouteMode = RouteMode.ROAD
    scheduled_game_s: float  # game-seconds from now until the reminder fires


class ConfirmLaunchResponse(BaseModel):
    rendezvous_order: RendezvousOrder
    truck_move_order: MoveOrder
    unit_move_order: MoveOrder
    refuel_order: RefuelOrder


@router.post("/rendezvous/plan")
async def plan_rendezvous_route(
    req: PlanRendezvousRequest,
    session: SessionDep,
    routing: Annotated[RoutingProvider, Depends(_routing)],
    instances: Annotated[UnitInstanceProvider, Depends(_instances)],
    units: Annotated[UnitDataProvider, Depends(_units)],
) -> RendezvousPlanResponse:
    """Plan Safe/Fast routes for both movers to the sector (each carries fuel-to-meet)."""
    try:
        plan = await plan_rendezvous(
            session,
            routing,
            instances,
            units,
            truck_id=req.truck_id,
            unit_id=req.unit_id,
            sector_lat=req.sector_lat,
            sector_lon=req.sector_lon,
            mode=req.mode,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if plan is None:
        raise HTTPException(
            status_code=422, detail="no route to the rendezvous sector for one or both movers"
        )
    return RendezvousPlanResponse(
        sector=SectorPoint(lat=plan.sector_lat, lon=plan.sector_lon, h3=plan.sector_h3),
        truck_routes=plan.truck_routes,
        unit_routes=plan.unit_routes,
    )


@router.post("/rendezvous", status_code=201)
async def create_rendezvous(
    req: CreateRendezvousRequest,
    session: SessionDep,
    routing: Annotated[RoutingProvider, Depends(_routing)],
    move_orders: Annotated[MoveOrderProvider, Depends(_move_orders)],
    refuel_orders: Annotated[RefuelOrderProvider, Depends(_refuel_orders)],
    instances: Annotated[UnitInstanceProvider, Depends(_instances)],
    units: Annotated[UnitDataProvider, Depends(_units)],
) -> RendezvousResponse:
    """Order now: dispatch both movers to the sector and activate the refuel."""
    try:
        result = await start_rendezvous(
            session,
            routing,
            move_orders,
            refuel_orders,
            instances,
            units,
            truck_id=req.truck_id,
            unit_id=req.unit_id,
            sector_lat=req.sector_lat,
            sector_lon=req.sector_lon,
            metric=req.metric,
            mode=req.mode,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if result is None:
        raise HTTPException(
            status_code=422,
            detail="rendezvous not possible (unroutable mover or invalid refuel linkage)",
        )
    return RendezvousResponse(
        sector=SectorPoint(lat=result.sector_lat, lon=result.sector_lon, h3=result.sector_h3),
        truck_move_order=result.truck_move_order,
        unit_move_order=result.unit_move_order,
        refuel_order=result.refuel_order,
    )


@router.post("/rendezvous/schedule", status_code=201)
async def schedule_rendezvous_route(
    req: ScheduleRendezvousRequest,
    session: SessionDep,
    routing: Annotated[RoutingProvider, Depends(_routing)],
    instances: Annotated[UnitInstanceProvider, Depends(_instances)],
    units: Annotated[UnitDataProvider, Depends(_units)],
    rendezvous_orders: Annotated[RendezvousOrderProvider, Depends(_rendezvous_orders)],
) -> RendezvousOrder:
    """File a rendezvous planned for ``scheduled_game_s`` game-seconds from now (no dispatch)."""
    try:
        order = await schedule_rendezvous(
            session,
            routing,
            instances,
            units,
            rendezvous_orders,
            truck_id=req.truck_id,
            unit_id=req.unit_id,
            sector_lat=req.sector_lat,
            sector_lon=req.sector_lon,
            metric=req.metric,
            mode=req.mode,
            scheduled_game_s=req.scheduled_game_s,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if order is None:
        raise HTTPException(
            status_code=422,
            detail="rendezvous not schedulable (unroutable sector or invalid refuel linkage)",
        )
    return order


@router.get("/rendezvous")
async def list_rendezvous(
    session: SessionDep,
    rendezvous_orders: Annotated[RendezvousOrderProvider, Depends(_rendezvous_orders)],
) -> list[RendezvousOrder]:
    """The rendezvous order archive (planned / due / launched / cancelled)."""
    return list(await rendezvous_orders.list_all(session))


@router.get("/rendezvous/{order_id}")
async def get_rendezvous(
    order_id: str,
    session: SessionDep,
    rendezvous_orders: Annotated[RendezvousOrderProvider, Depends(_rendezvous_orders)],
) -> RendezvousOrder:
    """One rendezvous order incl. both planned route geometries (for click-to-draw)."""
    order = await rendezvous_orders.get(session, order_id)
    if order is None:
        raise HTTPException(status_code=404, detail=f"rendezvous order {order_id!r} not found")
    return order


@router.post("/rendezvous/{order_id}/confirm-launch", status_code=201)
async def confirm_launch_route(
    order_id: str,
    session: SessionDep,
    routing: Annotated[RoutingProvider, Depends(_routing)],
    move_orders: Annotated[MoveOrderProvider, Depends(_move_orders)],
    refuel_orders: Annotated[RefuelOrderProvider, Depends(_refuel_orders)],
    instances: Annotated[UnitInstanceProvider, Depends(_instances)],
    units: Annotated[UnitDataProvider, Depends(_units)],
    rendezvous_orders: Annotated[RendezvousOrderProvider, Depends(_rendezvous_orders)],
) -> ConfirmLaunchResponse:
    """Dispatch a planned/due rendezvous now (operator confirmation; never auto-dispatched)."""
    try:
        launched = await confirm_launch(
            session,
            routing,
            move_orders,
            refuel_orders,
            instances,
            units,
            rendezvous_orders,
            order_id=order_id,
        )
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RendezvousAlreadyResolvedError as exc:
        raise HTTPException(
            status_code=409, detail=f"rendezvous already {exc} — cannot launch"
        ) from exc
    if launched is None:
        raise HTTPException(
            status_code=422, detail="rendezvous no longer routable — cannot launch"
        )
    order, result = launched
    return ConfirmLaunchResponse(
        rendezvous_order=order,
        truck_move_order=result.truck_move_order,
        unit_move_order=result.unit_move_order,
        refuel_order=result.refuel_order,
    )


@router.post("/rendezvous/{order_id}/cancel")
async def cancel_rendezvous_route(
    order_id: str,
    session: SessionDep,
    rendezvous_orders: Annotated[RendezvousOrderProvider, Depends(_rendezvous_orders)],
) -> RendezvousOrder:
    """Cancel a planned/due rendezvous."""
    try:
        return await cancel_rendezvous(session, rendezvous_orders, order_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except RendezvousAlreadyResolvedError as exc:
        raise HTTPException(
            status_code=409, detail=f"rendezvous already {exc} — cannot cancel"
        ) from exc
