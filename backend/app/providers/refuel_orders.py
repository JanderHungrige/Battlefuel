"""Refuel-order persistence providers and factory (Wave 5 Feature 3: refuel-orders)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.refuel import RefuelOrder, RefuelOrderStatus
from app.domain.unit import FuelType
from app.models.refuel_order import RefuelOrderRow


def _to_order(row: RefuelOrderRow) -> RefuelOrder:
    return RefuelOrder(
        id=row.id,
        unit_id=row.unit_id,
        truck_id=row.truck_id,
        fuel_type=FuelType(row.fuel_type),
        status=RefuelOrderStatus(row.status),
        rendezvous_lat=row.rendezvous_lat,
        rendezvous_lon=row.rendezvous_lon,
        rendezvous_h3=row.rendezvous_h3,
        requested_liters=row.requested_liters,
        transferred_liters=row.transferred_liters,
    )


class RefuelOrderProvider(ABC):
    @abstractmethod
    async def create(self, session: AsyncSession, order: RefuelOrder) -> RefuelOrder: ...

    @abstractmethod
    async def get(self, session: AsyncSession, order_id: str) -> RefuelOrder | None: ...

    @abstractmethod
    async def list_all(self, session: AsyncSession) -> Sequence[RefuelOrder]: ...

    @abstractmethod
    async def list_active(self, session: AsyncSession) -> Sequence[RefuelOrder]: ...

    @abstractmethod
    async def set_status(
        self, session: AsyncSession, order_id: str, status: RefuelOrderStatus
    ) -> RefuelOrder | None: ...

    @abstractmethod
    async def complete(
        self, session: AsyncSession, order_id: str, transferred_liters: float
    ) -> RefuelOrder | None: ...


class DbRefuelOrderProvider(RefuelOrderProvider):
    async def create(self, session: AsyncSession, order: RefuelOrder) -> RefuelOrder:
        session.add(
            RefuelOrderRow(
                id=order.id,
                unit_id=order.unit_id,
                truck_id=order.truck_id,
                fuel_type=order.fuel_type.value,
                status=order.status.value,
                rendezvous_lat=order.rendezvous_lat,
                rendezvous_lon=order.rendezvous_lon,
                rendezvous_h3=order.rendezvous_h3,
                requested_liters=order.requested_liters,
                transferred_liters=order.transferred_liters,
            )
        )
        await session.commit()
        return order

    async def get(self, session: AsyncSession, order_id: str) -> RefuelOrder | None:
        row = await session.get(RefuelOrderRow, order_id)
        return _to_order(row) if row is not None else None

    async def list_all(self, session: AsyncSession) -> Sequence[RefuelOrder]:
        rows = (await session.execute(select(RefuelOrderRow))).scalars().all()
        return [_to_order(r) for r in rows]

    async def list_active(self, session: AsyncSession) -> Sequence[RefuelOrder]:
        stmt = select(RefuelOrderRow).where(
            RefuelOrderRow.status == RefuelOrderStatus.ACTIVE.value
        )
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_order(r) for r in rows]

    async def set_status(
        self, session: AsyncSession, order_id: str, status: RefuelOrderStatus
    ) -> RefuelOrder | None:
        row = await session.get(RefuelOrderRow, order_id)
        if row is None:
            return None
        row.status = status.value
        await session.commit()
        return _to_order(row)

    async def complete(
        self, session: AsyncSession, order_id: str, transferred_liters: float
    ) -> RefuelOrder | None:
        row = await session.get(RefuelOrderRow, order_id)
        if row is None:
            return None
        row.status = RefuelOrderStatus.COMPLETE.value
        row.transferred_liters = transferred_liters
        await session.commit()
        return _to_order(row)


RefuelOrderProviderBuilder = Callable[[], RefuelOrderProvider]
_REGISTRY: dict[str, RefuelOrderProviderBuilder] = {}


class UnknownRefuelOrderProviderError(ValueError):
    """Raised when config names a refuel-order provider that is not registered."""


def register_refuel_order_provider(name: str, builder: RefuelOrderProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_refuel_order_provider(settings: Settings | None = None) -> RefuelOrderProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.refuel_order_provider]
    except KeyError as exc:
        raise UnknownRefuelOrderProviderError(
            f"unknown refuel-order provider {settings.refuel_order_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_refuel_order_provider("db", DbRefuelOrderProvider)
