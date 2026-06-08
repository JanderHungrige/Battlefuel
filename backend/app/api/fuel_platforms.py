"""Fuel-management platform endpoints (v2 Wave 11 Feature 2: fuel-platform-selector).

Mounted under ``/api/v1``. Lists the selectable procurement platforms and lets the operator
add a new one. All access goes through the :class:`FuelPlatformProvider` factory.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.fuel_platform import FuelPlatform
from app.providers.fuel_platforms import FuelPlatformProvider, build_fuel_platform_provider

router = APIRouter(tags=["fuel-platforms"])


def get_fuel_platform_provider() -> FuelPlatformProvider:
    return build_fuel_platform_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
PlatformDep = Annotated[FuelPlatformProvider, Depends(get_fuel_platform_provider)]


class CreateFuelPlatformRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    logo_key: str | None = Field(default=None, max_length=40)


@router.get("/fuel-platforms")
async def list_fuel_platforms(session: SessionDep, platforms: PlatformDep) -> list[FuelPlatform]:
    return list(await platforms.list_platforms(session))


@router.post("/fuel-platforms", status_code=201)
async def create_fuel_platform(
    req: CreateFuelPlatformRequest, session: SessionDep, platforms: PlatformDep
) -> FuelPlatform:
    """Add a new fuel-management platform (idempotent on the slugified name)."""
    return await platforms.create_platform(session, req.name, req.logo_key)
