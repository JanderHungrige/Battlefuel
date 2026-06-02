"""Movement & route advice endpoints (Wave 6 Feature 4). Mounted under /api/v1.

Route ranking reuses the Wave-3 planner; reposition is a heuristic over fuel/threat/depots/tiles.
Read-only; "apply" creates a move order.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.advice import CAPABILITIES
from app.db import get_session
from app.domain.advice import AdviceResult, Recommendation, RecommendationKind
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.routing import RoutingProvider, build_routing_provider
from app.providers.supply import SupplyProvider, build_supply_provider
from app.providers.tiles import TileDataProvider, build_tile_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.movement_advisor import rank_routes, reposition_suggestions
from app.services.route_planner import plan_routes

router = APIRouter(prefix="/advice", tags=["advice"])

CAPABILITIES.extend(["route", "reposition"])


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def get_unit_provider() -> UnitDataProvider:
    return build_unit_provider()


def get_routing_provider() -> RoutingProvider:
    return build_routing_provider()


def get_tile_provider() -> TileDataProvider:
    return build_tile_provider()


def get_supply_provider() -> SupplyProvider:
    return build_supply_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
InstanceDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]
UnitDep = Annotated[UnitDataProvider, Depends(get_unit_provider)]
RoutingDep = Annotated[RoutingProvider, Depends(get_routing_provider)]
TileDep = Annotated[TileDataProvider, Depends(get_tile_provider)]
SupplyDep = Annotated[SupplyProvider, Depends(get_supply_provider)]


@router.get("/route")
async def route_advice(
    session: SessionDep,
    instances: InstanceDep,
    units: UnitDep,
    routing: RoutingDep,
    instance_id: Annotated[str, Query()],
    dest_lat: Annotated[float, Query()],
    dest_lon: Annotated[float, Query()],
) -> AdviceResult:
    """Rank route options for a unit heading to a destination."""
    instance = await instances.get_instance(session, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {instance_id!r} not found")
    unit_type = units.get_unit(instance.unit_type_id)
    if unit_type is None:
        raise HTTPException(status_code=409, detail=f"unit type {instance.unit_type_id!r} missing")
    options = await plan_routes(session, routing, instance, unit_type, dest_lat, dest_lon)
    if not options:
        raise HTTPException(status_code=422, detail="no route to destination")

    recommendations = [
        Recommendation(
            kind=RecommendationKind.ROUTE,
            target=instance_id,
            action={
                "endpoint": "move-orders",
                "instance_id": instance_id,
                "dest_lat": dest_lat,
                "dest_lon": dest_lon,
                "metric": opt.metric.value,
            },
            score=score,
            rationale=rationale,
        )
        for opt, score, rationale in rank_routes(options)
    ]
    return AdviceResult(
        kind=RecommendationKind.ROUTE,
        recommendations=recommendations,
        summary=f"{len(recommendations)} route option(s), best first",
    )


@router.get("/reposition")
async def reposition_advice(
    session: SessionDep,
    instances: InstanceDep,
    units: UnitDep,
    tiles: TileDep,
    supply: SupplyDep,
) -> AdviceResult:
    """Suggest units worth repositioning (low fuel → depot; high threat → safe cell)."""
    placed = await instances.list_instances(session)
    all_tiles = await tiles.list_tiles(session)
    depots = await supply.list_depots(session)
    suggestions = reposition_suggestions(placed, units, all_tiles, depots)

    recommendations = [
        Recommendation(
            kind=RecommendationKind.REPOSITION,
            target=unit_id,
            action={
                "endpoint": "move-orders",
                "instance_id": unit_id,
                "dest_lat": dest_lat,
                "dest_lon": dest_lon,
                "metric": "safe",
            },
            score=score,
            rationale=rationale,
        )
        for unit_id, dest_lat, dest_lon, score, rationale in suggestions
    ]
    return AdviceResult(
        kind=RecommendationKind.REPOSITION,
        recommendations=recommendations,
        summary=f"{len(recommendations)} unit(s) suggested for repositioning",
    )
