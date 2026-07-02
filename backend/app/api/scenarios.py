"""Scenario save/load endpoints (v2 Wave 22 F5, scenario-save-load). Mounted under /api/v1.

Save the current hand-built state under a name, list saved scenarios, reload one (replacing the
live state), or delete one. Server-authoritative.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ws import manager
from app.db import get_session
from app.domain.scenario import ScenarioSummary
from app.services.scenario_service import (
    delete_scenario,
    list_scenarios,
    load_scenario,
    save_scenario,
)

router = APIRouter(tags=["scenarios"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]


class SaveScenarioRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80, description="Unique scenario name")


@router.get("/scenarios")
async def get_scenarios(session: SessionDep) -> list[ScenarioSummary]:
    """List saved scenarios, newest first."""
    return await list_scenarios(session)


@router.post("/scenarios", status_code=201)
async def create_scenario(req: SaveScenarioRequest, session: SessionDep) -> ScenarioSummary:
    """Save the current hand-built state under ``name`` (overwrites a same-named scenario)."""
    return await save_scenario(session, req.name)


@router.post("/scenarios/{scenario_id}/load")
async def load(scenario_id: str, session: SessionDep) -> ScenarioSummary:
    """Reload a saved scenario, replacing the live forces / depots / threats / obstacles."""
    if not await load_scenario(session, scenario_id):
        raise HTTPException(status_code=404, detail=f"scenario {scenario_id!r} not found")
    # Tell clients the world was replaced so they refresh (see ws frame consumers).
    await manager.broadcast({"type": "scenario_loaded", "scenario_id": scenario_id})
    scenarios = await list_scenarios(session)
    loaded = next((s for s in scenarios if s.id == scenario_id), None)
    assert loaded is not None
    return loaded


@router.delete("/scenarios/{scenario_id}", status_code=204)
async def remove(scenario_id: str, session: SessionDep) -> None:
    """Delete a saved scenario, or 404 if unknown."""
    if not await delete_scenario(session, scenario_id):
        raise HTTPException(status_code=404, detail=f"scenario {scenario_id!r} not found")
