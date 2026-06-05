"""Fuel-platform provider + factory (v2 Wave 11 Feature 2: fuel-platform-selector).

Same swap-point philosophy as the supply / buy-order factories: consumers depend on the
:class:`FuelPlatformProvider` interface and obtain one via :func:`build_fuel_platform_provider`,
selected by ``settings.fuel_platform_provider``. ``create`` is idempotent on the derived id so
re-adding a platform with the same name returns the existing row instead of erroring.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.fuel_platform import FuelPlatform, platform_id_from_name
from app.models.fuel_platform import FuelPlatformRow


def _to_platform(row: FuelPlatformRow) -> FuelPlatform:
    return FuelPlatform(
        id=row.id, name=row.name, logo_key=row.logo_key, is_default=row.is_default
    )


def _sort_key(p: FuelPlatform) -> tuple[bool, str]:
    # Default platform first, then alphabetical by name.
    return (not p.is_default, p.name.lower())


class FuelPlatformProvider(ABC):
    """Read/create access to fuel-management platforms."""

    @abstractmethod
    async def list_platforms(self, session: AsyncSession) -> Sequence[FuelPlatform]:
        """Return all platforms, default first then alphabetical."""

    @abstractmethod
    async def get_platform(self, session: AsyncSession, platform_id: str) -> FuelPlatform | None:
        """Return one platform by id, or ``None``."""

    @abstractmethod
    async def create_platform(
        self, session: AsyncSession, name: str, logo_key: str | None
    ) -> FuelPlatform:
        """Create (or return the existing) platform for ``name``. Commits."""


class DbFuelPlatformProvider(FuelPlatformProvider):
    async def list_platforms(self, session: AsyncSession) -> Sequence[FuelPlatform]:
        rows = (await session.execute(select(FuelPlatformRow))).scalars().all()
        return sorted((_to_platform(r) for r in rows), key=_sort_key)

    async def get_platform(self, session: AsyncSession, platform_id: str) -> FuelPlatform | None:
        row = await session.get(FuelPlatformRow, platform_id)
        return _to_platform(row) if row is not None else None

    async def create_platform(
        self, session: AsyncSession, name: str, logo_key: str | None
    ) -> FuelPlatform:
        platform_id = platform_id_from_name(name)
        existing = await session.get(FuelPlatformRow, platform_id)
        if existing is not None:
            return _to_platform(existing)
        row = FuelPlatformRow(
            id=platform_id, name=name.strip(), logo_key=logo_key, is_default=False
        )
        session.add(row)
        await session.commit()
        return _to_platform(row)


FuelPlatformProviderBuilder = Callable[[], FuelPlatformProvider]
_REGISTRY: dict[str, FuelPlatformProviderBuilder] = {}


class UnknownFuelPlatformProviderError(ValueError):
    """Raised when config names a fuel-platform provider that is not registered."""


def register_fuel_platform_provider(name: str, builder: FuelPlatformProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_fuel_platform_provider(settings: Settings | None = None) -> FuelPlatformProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.fuel_platform_provider]
    except KeyError as exc:
        raise UnknownFuelPlatformProviderError(
            f"unknown fuel platform provider {settings.fuel_platform_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_fuel_platform_provider("db", DbFuelPlatformProvider)
