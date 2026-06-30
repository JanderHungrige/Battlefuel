"""Enemy-unit endpoints (v2 Wave 3 + Wave 22 F1). Mounted under /api/v1.

Lists every red force: the configured in-memory source (seeded demo OPFOR and/or chatter sightings)
plus operator-**placed** hostiles persisted in the DB (the scenario creator, v2 Wave 22 F1). Placed
reds can be created and removed here; the in-memory ones are owned by their providers.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.enemy_unit import EnemyUnit
from app.providers.enemy_units import EnemyUnitProvider, build_enemy_unit_provider
from app.providers.factory import build_unit_provider
from app.providers.placed_enemy_units import (
    create_placed_enemy_unit,
    delete_placed_enemy_unit,
    list_placed_enemy_units,
)
from app.services.force_placement import place_enemy_unit

router = APIRouter(tags=["enemy-units"])


def get_enemy_unit_provider() -> EnemyUnitProvider:
    """FastAPI dependency: build the configured enemy-unit provider (overridable in tests)."""
    return build_enemy_unit_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
EnemyUnitProviderDep = Annotated[EnemyUnitProvider, Depends(get_enemy_unit_provider)]


class PlaceEnemyRequest(BaseModel):
    """Place a hostile unit of a catalog type at a point (v2 Wave 22 F1, scenario creator)."""

    unit_type_id: str = Field(description="A UnitType.id from the catalog (rendered hostile)")
    lat: float
    lon: float
    name: str | None = Field(default=None, description="Designation; defaults to 'OPFOR <type>'")


@router.get("/enemy-units")
async def list_enemy_units(
    session: SessionDep, provider: EnemyUnitProviderDep
) -> list[EnemyUnit]:
    """List all red forces: the configured in-memory source plus operator-placed (DB) hostiles."""
    placed = await list_placed_enemy_units(session)
    placed_ids = {e.id for e in placed}
    in_memory = [e for e in provider.units() if e.id not in placed_ids]
    return [*in_memory, *placed]


@router.post("/enemy-units", status_code=201)
async def place_enemy(req: PlaceEnemyRequest, session: SessionDep) -> EnemyUnit:
    """Place a hostile unit of ``unit_type_id`` at ``(lat, lon)``. 404 if the type is unknown."""
    unit_type = build_unit_provider().get_unit(req.unit_type_id)
    if unit_type is None:
        raise HTTPException(status_code=404, detail=f"unit type {req.unit_type_id!r} not found")
    enemy = place_enemy_unit(unit_type, req.lat, req.lon, req.name)
    return await create_placed_enemy_unit(session, enemy)


@router.delete("/enemy-units/{enemy_id}", status_code=204)
async def remove_enemy(enemy_id: str, session: SessionDep) -> None:
    """Remove an operator-placed hostile, or 404 if it is not a placed unit."""
    if not await delete_placed_enemy_unit(session, enemy_id):
        raise HTTPException(status_code=404, detail=f"placed enemy unit {enemy_id!r} not found")
