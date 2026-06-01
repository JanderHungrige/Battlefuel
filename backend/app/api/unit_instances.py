"""Placed unit-instance endpoints (Feature 4). Mounted under /api/v1.

Path is ``/unit-instances`` (not ``/units/instances``) to avoid colliding with the
catalog route ``/units/{unit_id}``.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.unit_instance import UnitInstance
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider

router = APIRouter(tags=["unit-instances"])


def get_instance_provider() -> UnitInstanceProvider:
    """FastAPI dependency: build the configured instance provider (overridable in tests)."""
    return build_unit_instance_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
InstanceProviderDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]


@router.get("/unit-instances")
async def list_unit_instances(
    session: SessionDep, provider: InstanceProviderDep
) -> list[UnitInstance]:
    """List all placed unit instances."""
    return list(await provider.list_instances(session))


@router.get("/unit-instances/{instance_id}")
async def get_unit_instance(
    instance_id: str, session: SessionDep, provider: InstanceProviderDep
) -> UnitInstance:
    """Fetch a single placed unit instance by id, or 404."""
    instance = await provider.get_instance(session, instance_id)
    if instance is None:
        raise HTTPException(status_code=404, detail=f"unit instance {instance_id!r} not found")
    return instance
