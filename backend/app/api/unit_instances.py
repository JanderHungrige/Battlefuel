"""Placed unit-instance endpoints (Feature 4). Mounted under /api/v1.

Path is ``/unit-instances`` (not ``/units/instances``) to avoid colliding with the
catalog route ``/units/{unit_id}``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.unit_instance import UnitInstance
from app.providers.factory import build_unit_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.force_placement import place_unit_instance

router = APIRouter(tags=["unit-instances"])


def get_instance_provider() -> UnitInstanceProvider:
    """FastAPI dependency: build the configured instance provider (overridable in tests)."""
    return build_unit_instance_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
InstanceProviderDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]


class PlaceUnitRequest(BaseModel):
    """Place a friendly unit of a catalog type at a point (v2 Wave 22 F1, scenario creator)."""

    unit_type_id: str = Field(description="A UnitType.id from the catalog")
    lat: float
    lon: float
    name: str | None = Field(default=None, description="Callsign; defaults to the unit-type name")


@router.get("/unit-instances")
async def list_unit_instances(
    session: SessionDep, provider: InstanceProviderDep
) -> list[UnitInstance]:
    """List all placed unit instances."""
    return list(await provider.list_instances(session))


@router.post("/unit-instances", status_code=201)
async def place_unit(
    req: PlaceUnitRequest, session: SessionDep, provider: InstanceProviderDep
) -> UnitInstance:
    """Place a friendly unit of ``unit_type_id`` at the point — half fuel (F2); 404 if unknown."""
    unit_type = build_unit_provider().get_unit(req.unit_type_id)
    if unit_type is None:
        raise HTTPException(status_code=404, detail=f"unit type {req.unit_type_id!r} not found")
    instance = place_unit_instance(unit_type, req.lat, req.lon, req.name)
    return await provider.create_instance(session, instance)


@router.delete("/unit-instances/{instance_id}", status_code=204)
async def remove_unit(
    instance_id: str, session: SessionDep, provider: InstanceProviderDep
) -> None:
    """Remove a placed unit instance, or 404 if the id is unknown."""
    if not await provider.delete_instance(session, instance_id):
        raise HTTPException(status_code=404, detail=f"unit instance {instance_id!r} not found")


@router.get("/unit-instances/{instance_id}")
async def get_unit_instance(
    instance_id: str, session: SessionDep, provider: InstanceProviderDep
) -> UnitInstance:
    """Fetch a single placed unit instance by id, or 404."""
    instance = await provider.get_instance(session, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {instance_id!r} not found")
    return instance


class TelemetryUpdateRequest(BaseModel):
    current_fuel_liters: float = Field(ge=0)


@router.post("/unit-instances/{instance_id}/telemetry")
async def set_unit_telemetry(
    instance_id: str,
    req: TelemetryUpdateRequest,
    session: SessionDep,
    provider: InstanceProviderDep,
) -> UnitInstance:
    """Manually set an instance's fuel telemetry (the "request manual update" action for units
    with no data). Server-authoritative; returns the updated instance, or 404 if unknown."""
    if await provider.get_instance(session, instance_id) is None:
        raise HTTPException(status_code=404, detail=f"unit instance {instance_id!r} not found")
    await provider.set_fuel(session, instance_id, req.current_fuel_liters)
    updated = await provider.get_instance(session, instance_id)
    assert updated is not None
    return updated
