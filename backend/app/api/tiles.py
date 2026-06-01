"""Map tile HTTP endpoints (Feature 3). Mounted under /api/v1."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.theater import BBox
from app.domain.tile import Tile
from app.providers.tiles import TileDataProvider, build_tile_provider

router = APIRouter(tags=["tiles"])


def get_tile_provider() -> TileDataProvider:
    """FastAPI dependency: build the configured tile provider (overridable in tests)."""
    return build_tile_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
TileProviderDep = Annotated[TileDataProvider, Depends(get_tile_provider)]


def _parse_bbox(bbox: str | None) -> BBox | None:
    if bbox is None:
        return None
    parts = bbox.split(",")
    if len(parts) != 4:
        raise HTTPException(status_code=422, detail="bbox must be 'west,south,east,north'")
    try:
        coords = [float(p) for p in parts]
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="bbox values must be numbers") from exc
    try:
        return BBox(west=coords[0], south=coords[1], east=coords[2], north=coords[3])
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/tiles")
async def list_tiles(
    session: SessionDep,
    provider: TileProviderDep,
    bbox: Annotated[str | None, Query(description="west,south,east,north")] = None,
) -> list[Tile]:
    """List tiles, optionally limited to a bbox (center inside the box)."""
    return list(await provider.list_tiles(session, _parse_bbox(bbox)))


@router.get("/tiles/{h3_index}")
async def get_tile(h3_index: str, session: SessionDep, provider: TileProviderDep) -> Tile:
    """Fetch a single tile by H3 index, or 404 if it does not exist."""
    tile = await provider.get_tile(session, h3_index)
    if tile is None:
        raise HTTPException(status_code=404, detail=f"tile {h3_index!r} not found")
    return tile
