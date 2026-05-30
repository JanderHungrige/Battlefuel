"""Unit catalog HTTP endpoints (Feature 4: unit-query-api).

Mounted under ``/api/v1`` by the app factory. Endpoints read through the data-source
factory, so they are agnostic to where unit data actually comes from.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from app.domain.unit import Echelon, NatoUnitType, UnitType
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider

router = APIRouter(tags=["units"])


def get_unit_provider() -> UnitDataProvider:
    """FastAPI dependency: build the configured unit provider.

    Declared as a dependency so tests can override it via
    ``app.dependency_overrides[get_unit_provider]``.
    """
    return build_unit_provider()


ProviderDep = Annotated[UnitDataProvider, Depends(get_unit_provider)]


@router.get("/units")
def list_units(
    provider: ProviderDep,
    nato_unit_type: Annotated[NatoUnitType | None, Query()] = None,
    echelon: Annotated[Echelon | None, Query()] = None,
) -> list[UnitType]:
    """List unit types, optionally filtered by category and/or echelon."""
    units = list(provider.list_units())
    if nato_unit_type is not None:
        units = [u for u in units if u.nato_unit_type is nato_unit_type]
    if echelon is not None:
        units = [u for u in units if u.echelon is echelon]
    return units


@router.get("/units/{unit_id}")
def get_unit(unit_id: str, provider: ProviderDep) -> UnitType:
    """Fetch a single unit type by id, or 404 if it does not exist."""
    unit = provider.get_unit(unit_id)
    if unit is None:
        raise HTTPException(status_code=404, detail=f"unit type {unit_id!r} not found")
    return unit
