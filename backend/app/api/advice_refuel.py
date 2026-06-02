"""Refuel-plan advice endpoint (Wave 6 Feature 2: refuel-optimizer). Mounted under /api/v1.

Assigns available fuel trucks to thirsty units with OR-Tools and returns one recommendation per
served unit. Read-only; "apply" creates a refuel order (which re-derives the same truck when the
``ortools`` recommender is active).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.advice import CAPABILITIES
from app.db import get_session
from app.domain.advice import AdviceResult, Recommendation, RecommendationKind
from app.domain.unit import NatoUnitType
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.refuel_assignment import assign_trucks

router = APIRouter(prefix="/advice", tags=["advice"])

CAPABILITIES.append("refuel")


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def get_unit_provider() -> UnitDataProvider:
    return build_unit_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
InstanceDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]
UnitDep = Annotated[UnitDataProvider, Depends(get_unit_provider)]


@router.get("/refuel-plan")
async def refuel_plan(session: SessionDep, instances: InstanceDep, units: UnitDep) -> AdviceResult:
    """Recommend truck→unit refuel pairings for all thirsty units."""
    placed = await instances.list_instances(session)
    thirsty = []
    trucks = []
    for inst in placed:
        ut = units.get_unit(inst.unit_type_id)
        if ut is None:
            continue
        if ut.nato_unit_type is NatoUnitType.FUEL_SUPPLY:
            if (inst.current_fuel_liters or 0.0) > 0.0:
                trucks.append(inst)
        elif (
            inst.current_fuel_liters is not None
            and inst.current_fuel_liters < ut.fuel.capacity_liters
        ):
            thirsty.append(inst)

    recommendations = [
        Recommendation(
            kind=RecommendationKind.REFUEL,
            target=unit_id,
            action={"endpoint": "refuel-orders", "unit_id": unit_id, "truck_id": truck_id},
            score=cost,
            rationale=f"Assign {truck_id} (cost {cost:.1f}: distance + fuel adequacy)",
        )
        for unit_id, truck_id, cost in assign_trucks(thirsty, trucks)
    ]
    return AdviceResult(
        kind=RecommendationKind.REFUEL,
        recommendations=recommendations,
        summary=f"{len(recommendations)} unit(s) matched to {len(trucks)} truck(s)",
    )
