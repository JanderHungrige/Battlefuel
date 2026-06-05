"""Redistribution advice endpoint (Wave 6 Feature 3). Mounted under /api/v1.

Computes a distance-minimising depot rebalancing plan (OR-Tools) plus buy suggestions for any
uncovered deficit. Read-only; only the buy moves are applyable (no depot→depot order type exists).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.advice import CAPABILITIES
from app.db import get_session
from app.domain.advice import AdviceResult, Recommendation, RecommendationKind
from app.providers.supply import SupplyProvider, build_supply_provider
from app.services.redistribution import RedistributionMove, redistribution_plan

router = APIRouter(prefix="/advice", tags=["advice"])

CAPABILITIES.append("redistribution")


def get_supply_provider() -> SupplyProvider:
    return build_supply_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SupplyDep = Annotated[SupplyProvider, Depends(get_supply_provider)]


def _to_recommendation(
    m: RedistributionMove, coords: dict[str, tuple[float, float]]
) -> Recommendation:
    to = coords.get(m.to_depot)
    if m.kind == "buy":
        action: dict[str, object] = {
            "endpoint": "buy-orders",
            "depot_id": m.to_depot,
            "fuel_type": m.fuel_type,
            "quantity_liters": m.liters,
        }
        if to is not None:
            action["dest_lat"], action["dest_lon"] = to[0], to[1]
        return Recommendation(
            kind=RecommendationKind.REDISTRIBUTION,
            target=m.to_depot,
            action=action,
            score=m.cost,
            rationale=f"Buy {m.liters} L {m.fuel_type} into {m.to_depot} (no surplus to cover)",
        )
    frm = coords.get(m.from_depot) if m.from_depot else None
    action = {
        "kind": "transfer",
        "from_depot": m.from_depot,
        "to_depot": m.to_depot,
        "fuel_type": m.fuel_type,
        "liters": m.liters,
    }
    if frm is not None and to is not None:
        action["from_lat"], action["from_lon"] = frm[0], frm[1]
        action["to_lat"], action["to_lon"] = to[0], to[1]
    return Recommendation(
        kind=RecommendationKind.REDISTRIBUTION,
        target=m.to_depot,
        action=action,
        score=m.cost,
        rationale=f"Move {m.liters} L {m.fuel_type} {m.from_depot}→{m.to_depot} ({m.cost:.0f} km)",
    )


@router.get("/redistribution")
async def redistribution(session: SessionDep, supply: SupplyDep) -> AdviceResult:
    """Recommend depot transfers (and buys) to balance fuel toward target fill."""
    depots = await supply.list_depots(session)
    stocks = await supply.list_stocks(session)
    moves = redistribution_plan(depots, stocks)
    coords = {d.id: (d.lat, d.lon) for d in depots}
    recommendations = [_to_recommendation(m, coords) for m in moves]
    transfers = sum(1 for m in moves if m.kind == "transfer")
    buys = sum(1 for m in moves if m.kind == "buy")
    return AdviceResult(
        kind=RecommendationKind.REDISTRIBUTION,
        recommendations=recommendations,
        summary=f"{transfers} transfer(s), {buys} buy(s) to balance depots",
    )


@router.get("/site-refuel/{depot_id}")
async def site_refuel(depot_id: str, session: SessionDep, supply: SupplyDep) -> AdviceResult:
    """Propose a refuel/redistribution order for one low logistic site (v2 Wave 11 F5).

    Reuses the Wave-6 redistribution optimizer and filters the plan to moves targeting this
    site. An empty recommendation list means the site is already at/above target fill.
    """
    depot = await supply.get_depot(session, depot_id)
    if depot is None:
        raise HTTPException(status_code=404, detail=f"depot {depot_id!r} not found")
    depots = await supply.list_depots(session)
    stocks = await supply.list_stocks(session)
    coords = {d.id: (d.lat, d.lon) for d in depots}
    moves = [m for m in redistribution_plan(depots, stocks) if m.to_depot == depot_id]
    recommendations = [_to_recommendation(m, coords) for m in moves]
    name = depot.name
    summary = (
        f"{len(recommendations)} proposal(s) to refuel {name}"
        if recommendations
        else f"{name} is at or above target fill — no refuel needed"
    )
    return AdviceResult(
        kind=RecommendationKind.REDISTRIBUTION,
        recommendations=recommendations,
        summary=summary,
    )
