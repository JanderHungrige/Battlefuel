"""Unit-instance providers and factory (Feature 4)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import delete, select, update
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

    @abstractmethod
    async def set_fuel(self, session: AsyncSession, instance_id: str, liters: float) -> None:
        """Set an instance's ``current_fuel_liters`` (the mutation path for fuel transfers)."""

    @abstractmethod
    async def create_instance(self, session: AsyncSession, instance: UnitInstance) -> UnitInstance:
        """Persist a new placed instance (scenario creator, v2 Wave 22 F1). Returns it."""

    @abstractmethod
    async def delete_instance(self, session: AsyncSession, instance_id: str) -> bool:
        """Remove a placed instance. True if one was deleted, False if the id was unknown."""


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

    async def set_fuel(self, session: AsyncSession, instance_id: str, liters: float) -> None:
        await session.execute(
            update(UnitInstanceRow)
            .where(UnitInstanceRow.id == instance_id)
            .values(current_fuel_liters=liters)
        )
        await session.commit()

    async def create_instance(self, session: AsyncSession, instance: UnitInstance) -> UnitInstance:
        session.add(
            UnitInstanceRow(
                id=instance.id,
                name=instance.name,
                unit_type_id=instance.unit_type_id,
                lat=instance.lat,
                lon=instance.lon,
                h3_index=instance.h3_index,
                status=instance.status.value,
                current_fuel_liters=instance.current_fuel_liters,
            )
        )
        await session.commit()
        return instance

    async def delete_instance(self, session: AsyncSession, instance_id: str) -> bool:
        result = await session.execute(
            delete(UnitInstanceRow)
            .where(UnitInstanceRow.id == instance_id)
            .returning(UnitInstanceRow.id)
        )
        await session.commit()
        return result.first() is not None


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
