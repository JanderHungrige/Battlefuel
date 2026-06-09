"""Route planning endpoint (Wave 3, route-planning-api). Mounted under /api/v1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.route import RouteMode, RouteOption
from app.providers.factory import build_unit_provider
from app.providers.routing import RoutingProvider, build_routing_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.route_planner import plan_routes, plan_waypoint_routes

router = APIRouter(tags=["routes"])


def get_routing_provider() -> RoutingProvider:
    return build_routing_provider()


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
RoutingDep = Annotated[RoutingProvider, Depends(get_routing_provider)]
InstanceDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]


class PlanRouteRequest(BaseModel):
    instance_id: str
    dest_lat: float
    dest_lon: float
    mode: RouteMode = RouteMode.ROAD


@router.post("/routes/plan")
async def plan_route(
    req: PlanRouteRequest,
    session: SessionDep,
    routing: RoutingDep,
    instances: InstanceDep,
) -> list[RouteOption]:
    """Plan fastest + safest routes for a placed unit to a destination."""
    instance = await instances.get_instance(session, req.instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {req.instance_id!r} not found")

    unit_type = build_unit_provider().get_unit(instance.unit_type_id)
    if unit_type is None:
        raise HTTPException(
            status_code=409,
            detail=f"unit type {instance.unit_type_id!r} not in catalog",
        )

    options = await plan_routes(
        session, routing, instance, unit_type, req.dest_lat, req.dest_lon, mode=req.mode
    )
    if not options:
        raise HTTPException(status_code=422, detail="no route to destination")
    return options


class Waypoint(BaseModel):
    lat: float
    lon: float
    mode: RouteMode | None = None  # per-leg travel mode (v2 W16 F3); falls back to the request mode


class PlanWaypointsRequest(BaseModel):
    instance_id: str
    waypoints: list[Waypoint]
    mode: RouteMode = RouteMode.ROAD


@router.post("/routes/plan-waypoints")
async def plan_waypoints_route(
    req: PlanWaypointsRequest,
    session: SessionDep,
    routing: RoutingDep,
    instances: InstanceDep,
) -> list[RouteOption]:
    """Plan fastest + safest routes through an ordered list of operator waypoints (v2 Wave 10)."""
    if not req.waypoints:
        raise HTTPException(status_code=422, detail="at least one waypoint is required")
    instance = await instances.get_instance(session, req.instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {req.instance_id!r} not found")
    unit_type = build_unit_provider().get_unit(instance.unit_type_id)
    if unit_type is None:
        raise HTTPException(
            status_code=409, detail=f"unit type {instance.unit_type_id!r} not in catalog"
        )
    options = await plan_waypoint_routes(
        session,
        routing,
        instance,
        unit_type,
        [(w.lat, w.lon) for w in req.waypoints],
        mode=req.mode,
        modes=[w.mode or req.mode for w in req.waypoints],
    )
    if not options:
        raise HTTPException(status_code=422, detail="no route through the given waypoints")
    return options
