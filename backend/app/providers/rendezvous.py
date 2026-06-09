"""Rendezvous-order persistence providers and factory (v2 Wave 13 F2)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.rendezvous import RendezvousOrder, RendezvousOrderStatus
from app.domain.route import RouteMetric, RouteMode
from app.models.rendezvous import RendezvousOrderRow


def _to_order(row: RendezvousOrderRow) -> RendezvousOrder:
    return RendezvousOrder(
        id=row.id,
        truck_id=row.truck_id,
        unit_id=row.unit_id,
        sector_lat=row.sector_lat,
        sector_lon=row.sector_lon,
        sector_h3=row.sector_h3,
        metric=RouteMetric(row.metric),
        mode=RouteMode(row.mode),
        scheduled_game_s=row.scheduled_game_s,
        remaining_game_s=row.remaining_game_s,
        truck_geometry=row.truck_geometry,
        unit_geometry=row.unit_geometry,
        truck_fuel_to_meet=row.truck_fuel_to_meet,
        unit_fuel_to_meet=row.unit_fuel_to_meet,
        status=RendezvousOrderStatus(row.status),
    )


class RendezvousOrderProvider(ABC):
    @abstractmethod
    async def create(self, session: AsyncSession, order: RendezvousOrder) -> RendezvousOrder: ...

    @abstractmethod
    async def get(self, session: AsyncSession, order_id: str) -> RendezvousOrder | None: ...

    @abstractmethod
    async def list_all(self, session: AsyncSession) -> Sequence[RendezvousOrder]: ...

    @abstractmethod
    async def list_planned(self, session: AsyncSession) -> Sequence[RendezvousOrder]: ...

    @abstractmethod
    async def set_status(
        self, session: AsyncSession, order_id: str, status: RendezvousOrderStatus
    ) -> RendezvousOrder | None: ...

    @abstractmethod
    async def set_remaining(
        self, session: AsyncSession, order_id: str, remaining_game_s: float
    ) -> None: ...


class DbRendezvousOrderProvider(RendezvousOrderProvider):
    async def create(self, session: AsyncSession, order: RendezvousOrder) -> RendezvousOrder:
        session.add(
            RendezvousOrderRow(
                id=order.id,
                truck_id=order.truck_id,
                unit_id=order.unit_id,
                sector_lat=order.sector_lat,
                sector_lon=order.sector_lon,
                sector_h3=order.sector_h3,
                metric=order.metric.value,
                mode=order.mode.value,
                scheduled_game_s=order.scheduled_game_s,
                remaining_game_s=order.remaining_game_s,
                truck_geometry=order.truck_geometry,
                unit_geometry=order.unit_geometry,
                truck_fuel_to_meet=order.truck_fuel_to_meet,
                unit_fuel_to_meet=order.unit_fuel_to_meet,
                status=order.status.value,
            )
        )
        await session.commit()
        return order

    async def get(self, session: AsyncSession, order_id: str) -> RendezvousOrder | None:
        row = await session.get(RendezvousOrderRow, order_id)
        return _to_order(row) if row is not None else None

    async def list_all(self, session: AsyncSession) -> Sequence[RendezvousOrder]:
        rows = (await session.execute(select(RendezvousOrderRow))).scalars().all()
        return [_to_order(r) for r in rows]

    async def list_planned(self, session: AsyncSession) -> Sequence[RendezvousOrder]:
        stmt = select(RendezvousOrderRow).where(
            RendezvousOrderRow.status == RendezvousOrderStatus.PLANNED.value
        )
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_order(r) for r in rows]

    async def set_status(
        self, session: AsyncSession, order_id: str, status: RendezvousOrderStatus
    ) -> RendezvousOrder | None:
        row = await session.get(RendezvousOrderRow, order_id)
        if row is None:
            return None
        row.status = status.value
        await session.commit()
        return _to_order(row)

    async def set_remaining(
        self, session: AsyncSession, order_id: str, remaining_game_s: float
    ) -> None:
        row = await session.get(RendezvousOrderRow, order_id)
        if row is None:
            return
        row.remaining_game_s = remaining_game_s
        await session.commit()


RendezvousOrderProviderBuilder = Callable[[], RendezvousOrderProvider]
_REGISTRY: dict[str, RendezvousOrderProviderBuilder] = {}


class UnknownRendezvousOrderProviderError(ValueError):
    """Raised when config names a rendezvous-order provider that is not registered."""


def register_rendezvous_order_provider(
    name: str, builder: RendezvousOrderProviderBuilder
) -> None:
    _REGISTRY[name] = builder


def build_rendezvous_order_provider(settings: Settings | None = None) -> RendezvousOrderProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.rendezvous_order_provider]
    except KeyError as exc:
        raise UnknownRendezvousOrderProviderError(
            f"unknown rendezvous-order provider {settings.rendezvous_order_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_rendezvous_order_provider("db", DbRendezvousOrderProvider)
