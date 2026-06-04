"""Fuel-supply providers and factory (Wave 5 Feature 1: fuel-supply-model).

Same swap-point philosophy as the unit / tile / move-order factories: consumers depend on
the :class:`SupplyProvider` interface and obtain one via :func:`build_supply_provider`,
selected by ``settings.supply_provider``. ``adjust_stock`` is the single mutation path for
depot stock — buy delivery and any future drawdown go through it, never a raw UPDATE.
"""

from __future__ import annotations

import uuid
from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

import h3
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.supply import FuelDepot, FuelStock
from app.domain.unit import FuelType
from app.models.supply import FuelDepotRow, FuelStockRow
from app.services.tile_grid import DEFAULT_RESOLUTION


def _to_depot(row: FuelDepotRow) -> FuelDepot:
    return FuelDepot(id=row.id, name=row.name, h3_index=row.h3_index, lat=row.lat, lon=row.lon)


def _to_stock(row: FuelStockRow) -> FuelStock:
    return FuelStock(
        depot_id=row.depot_id,
        fuel_type=FuelType(row.fuel_type),
        quantity_liters=row.quantity_liters,
        capacity_liters=row.capacity_liters,
    )


class SupplyProvider(ABC):
    """Read/adjust access to fuel depots and their stock."""

    @abstractmethod
    async def list_depots(self, session: AsyncSession) -> Sequence[FuelDepot]:
        """Return all fuel depots."""

    @abstractmethod
    async def get_depot(self, session: AsyncSession, depot_id: str) -> FuelDepot | None:
        """Return a single depot by id, or ``None``."""

    @abstractmethod
    async def create_depot(
        self, session: AsyncSession, name: str, lat: float, lon: float
    ) -> FuelDepot:
        """Create + persist a fuel depot at (lat, lon). Commits (v2 Wave 10, add-depot)."""

    @abstractmethod
    async def list_stocks(
        self, session: AsyncSession, depot_id: str | None = None
    ) -> Sequence[FuelStock]:
        """Return all stock rows, optionally limited to one depot."""

    @abstractmethod
    async def get_stock(
        self, session: AsyncSession, depot_id: str, fuel_type: FuelType
    ) -> FuelStock | None:
        """Return one (depot, fuel-type) stock row, or ``None``."""

    @abstractmethod
    async def adjust_stock(
        self,
        session: AsyncSession,
        depot_id: str,
        fuel_type: FuelType,
        delta_liters: float,
    ) -> FuelStock | None:
        """Add ``delta_liters`` to a stock row, clamped to ``[0, capacity]``.

        Returns the updated stock, or ``None`` if the row does not exist. Commits.
        """


class DbSupplyProvider(SupplyProvider):
    async def list_depots(self, session: AsyncSession) -> Sequence[FuelDepot]:
        rows = (await session.execute(select(FuelDepotRow))).scalars().all()
        return [_to_depot(r) for r in rows]

    async def get_depot(self, session: AsyncSession, depot_id: str) -> FuelDepot | None:
        row = await session.get(FuelDepotRow, depot_id)
        return _to_depot(row) if row is not None else None

    async def create_depot(
        self, session: AsyncSession, name: str, lat: float, lon: float
    ) -> FuelDepot:
        row = FuelDepotRow(
            id=uuid.uuid4().hex,
            name=name,
            h3_index=h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION),
            lat=lat,
            lon=lon,
        )
        session.add(row)
        await session.commit()
        return _to_depot(row)

    async def list_stocks(
        self, session: AsyncSession, depot_id: str | None = None
    ) -> Sequence[FuelStock]:
        stmt = select(FuelStockRow)
        if depot_id is not None:
            stmt = stmt.where(FuelStockRow.depot_id == depot_id)
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_stock(r) for r in rows]

    async def get_stock(
        self, session: AsyncSession, depot_id: str, fuel_type: FuelType
    ) -> FuelStock | None:
        row = await session.get(FuelStockRow, (depot_id, fuel_type.value))
        return _to_stock(row) if row is not None else None

    async def adjust_stock(
        self,
        session: AsyncSession,
        depot_id: str,
        fuel_type: FuelType,
        delta_liters: float,
    ) -> FuelStock | None:
        row = await session.get(FuelStockRow, (depot_id, fuel_type.value))
        if row is None:
            return None
        row.quantity_liters = min(row.capacity_liters, max(0.0, row.quantity_liters + delta_liters))
        await session.commit()
        return _to_stock(row)


SupplyProviderBuilder = Callable[[], SupplyProvider]
_REGISTRY: dict[str, SupplyProviderBuilder] = {}


class UnknownSupplyProviderError(ValueError):
    """Raised when config names a supply provider that is not registered."""


def register_supply_provider(name: str, builder: SupplyProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_supply_provider(settings: Settings | None = None) -> SupplyProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.supply_provider]
    except KeyError as exc:
        raise UnknownSupplyProviderError(
            f"unknown supply provider {settings.supply_provider!r}; available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_supply_provider("db", DbSupplyProvider)
