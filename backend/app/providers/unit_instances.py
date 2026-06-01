"""Unit-instance providers and factory (Feature 4)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.unit_instance import InstanceStatus, UnitInstance
from app.models.unit_instance import UnitInstanceRow


class UnitInstanceProvider(ABC):
    """Read access to placed unit instances."""

    @abstractmethod
    async def list_instances(self, session: AsyncSession) -> Sequence[UnitInstance]:
        """Return all placed unit instances."""

    @abstractmethod
    async def get_instance(self, session: AsyncSession, instance_id: str) -> UnitInstance | None:
        """Return a single instance by id, or ``None``."""


def _to_instance(row: UnitInstanceRow) -> UnitInstance:
    return UnitInstance(
        id=row.id,
        name=row.name,
        unit_type_id=row.unit_type_id,
        lat=row.lat,
        lon=row.lon,
        h3_index=row.h3_index,
        status=InstanceStatus(row.status),
        current_fuel_liters=row.current_fuel_liters,
    )


class DbUnitInstanceProvider(UnitInstanceProvider):
    async def list_instances(self, session: AsyncSession) -> Sequence[UnitInstance]:
        rows = (await session.execute(select(UnitInstanceRow))).scalars().all()
        return [_to_instance(r) for r in rows]

    async def get_instance(self, session: AsyncSession, instance_id: str) -> UnitInstance | None:
        row = await session.get(UnitInstanceRow, instance_id)
        return _to_instance(row) if row is not None else None


InstanceProviderBuilder = Callable[[], UnitInstanceProvider]
_REGISTRY: dict[str, InstanceProviderBuilder] = {}


class UnknownInstanceProviderError(ValueError):
    """Raised when config names an instance provider that is not registered."""


def register_instance_provider(name: str, builder: InstanceProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_unit_instance_provider(settings: Settings | None = None) -> UnitInstanceProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.unit_instance_provider]
    except KeyError as exc:
        raise UnknownInstanceProviderError(
            f"unknown instance provider {settings.unit_instance_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_instance_provider("db", DbUnitInstanceProvider)
