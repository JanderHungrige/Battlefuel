"""Manual obstacle endpoints (Wave 4, manual-obstacles). Mounted under /api/v1."""

from __future__ import annotations

from typing import Annotated

import h3
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ws import manager
from app.db import get_session
from app.domain.obstacle import Obstacle, ObstacleCreate
from app.providers.obstacles import ObstacleProvider, build_obstacle_provider
from app.services.tile_grid import DEFAULT_RESOLUTION

router = APIRouter(tags=["obstacles"])


def get_obstacle_provider() -> ObstacleProvider:
    return build_obstacle_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
ObstacleDep = Annotated[ObstacleProvider, Depends(get_obstacle_provider)]


def _frame(action: str, obstacle: Obstacle) -> dict[str, object]:
    return {
        "type": "obstacle_update",
        "action": action,
        "id": obstacle.id,
        "h3_index": obstacle.h3_index,
        "kind": obstacle.kind,
    }


@router.post("/obstacles", status_code=201)
async def create_obstacle(
    req: ObstacleCreate, session: SessionDep, obstacles: ObstacleDep
) -> Obstacle:
    """Place an obstacle at a location; its H3 cell's edges are excluded from routing."""
    cell = h3.latlng_to_cell(req.lat, req.lon, DEFAULT_RESOLUTION)
    obstacle = await obstacles.create(session, cell, req.kind)
    await manager.broadcast(_frame("added", obstacle))
    return obstacle


@router.get("/obstacles")
async def list_obstacles(session: SessionDep, obstacles: ObstacleDep) -> list[Obstacle]:
    return list(await obstacles.list_all(session))


@router.delete("/obstacles/{obstacle_id}", status_code=200)
async def delete_obstacle(
    obstacle_id: str, session: SessionDep, obstacles: ObstacleDep
) -> dict[str, str]:
    """Remove an obstacle; routing stops avoiding its cell."""
    # Look it up first so the broadcast carries the cell (for the frontend to clear it).
    existing = next((o for o in await obstacles.list_all(session) if o.id == obstacle_id), None)
    if existing is None:
        raise HTTPException(status_code=404, detail=f"obstacle {obstacle_id!r} not found")
    await obstacles.delete(session, obstacle_id)
    await manager.broadcast(_frame("removed", existing))
    return {"id": obstacle_id, "status": "removed"}
