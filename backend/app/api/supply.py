"""Fuel supply read endpoints (Wave 5 Feature 2: supply-stock-api). Mounted under /api/v1.

Lists depots and stock, and computes the OF-8 distribution overview. Read-only — depot/stock
mutation is feature 27 (buy) / 26 (refuel). All access goes through the factories.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.domain.supply import FuelDepot, FuelStock, LogisticSiteType, SupplyOverview
from app.domain.unit import FuelType
from app.providers.base import UnitDataProvider
from app.providers.factory import build_unit_provider
from app.providers.supply import SupplyProvider, build_supply_provider
from app.providers.unit_instances import UnitInstanceProvider, build_unit_instance_provider
from app.services.supply_overview import build_supply_overview

router = APIRouter(tags=["supply"])


def get_supply_provider() -> SupplyProvider:
    return build_supply_provider()


def get_instance_provider() -> UnitInstanceProvider:
    return build_unit_instance_provider()


def get_unit_provider() -> UnitDataProvider:
    return build_unit_provider()


SessionDep = Annotated[AsyncSession, Depends(get_session)]
SupplyDep = Annotated[SupplyProvider, Depends(get_supply_provider)]
InstanceDep = Annotated[UnitInstanceProvider, Depends(get_instance_provider)]
UnitDep = Annotated[UnitDataProvider, Depends(get_unit_provider)]


class CreateDepotRequest(BaseModel):
    name: str
    lat: float
    lon: float
    # NATO JLSG site type (v2 Wave 11 F5); None places a plain depot/marker.
    site_type: LogisticSiteType | None = None


@router.post("/depots", status_code=201)
async def create_depot(
    req: CreateDepotRequest, session: SessionDep, supply: SupplyDep
) -> FuelDepot:
    """Manually place a fuel depot, or a typed stocked logistic site (v2 Wave 10 / W11 F5)."""
    return await supply.create_depot(session, req.name, req.lat, req.lon, req.site_type)


@router.get("/depots")
async def list_depots(session: SessionDep, supply: SupplyDep) -> list[FuelDepot]:
    return list(await supply.list_depots(session))


@router.get("/depots/{depot_id}")
async def get_depot(depot_id: str, session: SessionDep, supply: SupplyDep) -> FuelDepot:
    depot = await supply.get_depot(session, depot_id)
    if depot is None:
        raise HTTPException(status_code=404, detail=f"depot {depot_id!r} not found")
    return depot


@router.get("/fuel-stocks")
async def list_fuel_stocks(
    session: SessionDep,
    supply: SupplyDep,
    depot_id: Annotated[str | None, Query()] = None,
    fuel_type: Annotated[FuelType | None, Query()] = None,
) -> list[FuelStock]:
    stocks = await supply.list_stocks(session, depot_id=depot_id)
    if fuel_type is not None:
        stocks = [s for s in stocks if s.fuel_type is fuel_type]
    return list(stocks)


@router.get("/supply/overview")
async def supply_overview(
    session: SessionDep,
    supply: SupplyDep,
    instances: InstanceDep,
    units: UnitDep,
) -> SupplyOverview:
    return await build_supply_overview(session, supply, instances, units)
