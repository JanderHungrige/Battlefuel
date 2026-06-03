"""Move-order persistence providers and factory (Wave 3, move-orders)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.move_order import MoveOrder, MoveOrderStatus
from app.domain.route import RouteMetric
from app.models.move_order import MoveOrderRow


def _to_order(row: MoveOrderRow) -> MoveOrder:
    return MoveOrder(
        id=row.id,
        instance_id=row.instance_id,
        status=MoveOrderStatus(row.status),
        metric=RouteMetric(row.metric),
        distance_m=row.distance_m,
        duration_s=row.duration_s,
        fuel_consumed_l=row.fuel_consumed_l,
        progress_m=row.progress_m,
        geometry=row.geometry,
    )


class MoveOrderProvider(ABC):
    @abstractmethod
    async def create(self, session: AsyncSession, order: MoveOrder) -> MoveOrder: ...

    @abstractmethod
    async def get(self, session: AsyncSession, order_id: str) -> MoveOrder | None: ...

    @abstractmethod
    async def list_all(self, session: AsyncSession) -> Sequence[MoveOrder]: ...

    @abstractmethod
    async def list_active(self, session: AsyncSession) -> Sequence[MoveOrder]: ...

    @abstractmethod
    async def set_status(
        self, session: AsyncSession, order_id: str, status: MoveOrderStatus
    ) -> MoveOrder | None: ...

    @abstractmethod
    async def set_progress(
        self,
        session: AsyncSession,
        order_id: str,
        progress_m: float,
        status: MoveOrderStatus,
    ) -> None: ...


class DbMoveOrderProvider(MoveOrderProvider):
    async def create(self, session: AsyncSession, order: MoveOrder) -> MoveOrder:
        session.add(
            MoveOrderRow(
                id=order.id,
                instance_id=order.instance_id,
                status=order.status.value,
                metric=order.metric.value,
                distance_m=order.distance_m,
                duration_s=order.duration_s,
                fuel_consumed_l=order.fuel_consumed_l,
                progress_m=order.progress_m,
                geometry=order.geometry,
            )
        )
        await session.commit()
        return order

    async def get(self, session: AsyncSession, order_id: str) -> MoveOrder | None:
        row = await session.get(MoveOrderRow, order_id)
        return _to_order(row) if row is not None else None

    async def list_all(self, session: AsyncSession) -> Sequence[MoveOrder]:
        rows = (await session.execute(select(MoveOrderRow))).scalars().all()
        return [_to_order(r) for r in rows]

    async def list_active(self, session: AsyncSession) -> Sequence[MoveOrder]:
        # ACTIVE and CROSSING orders are both advanced by the sim (a CROSSING order is crawling
        # across an obstruction the operator chose to push through).
        stmt = select(MoveOrderRow).where(
            MoveOrderRow.status.in_(
                [MoveOrderStatus.ACTIVE.value, MoveOrderStatus.CROSSING.value]
            )
        )
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_order(r) for r in rows]

    async def set_status(
        self, session: AsyncSession, order_id: str, status: MoveOrderStatus
    ) -> MoveOrder | None:
        row = await session.get(MoveOrderRow, order_id)
        if row is None:
            return None
        row.status = status.value
        await session.commit()
        return _to_order(row)

    async def set_progress(
        self,
        session: AsyncSession,
        order_id: str,
        progress_m: float,
        status: MoveOrderStatus,
    ) -> None:
        await session.execute(
            update(MoveOrderRow)
            .where(MoveOrderRow.id == order_id)
            .values(progress_m=progress_m, status=status.value)
        )
        await session.commit()


MoveOrderProviderBuilder = Callable[[], MoveOrderProvider]
_REGISTRY: dict[str, MoveOrderProviderBuilder] = {}


class UnknownMoveOrderProviderError(ValueError):
    """Raised when config names a move-order provider that is not registered."""


def register_move_order_provider(name: str, builder: MoveOrderProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_move_order_provider(settings: Settings | None = None) -> MoveOrderProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.move_order_provider]
    except KeyError as exc:
        raise UnknownMoveOrderProviderError(
            f"unknown move-order provider {settings.move_order_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_move_order_provider("db", DbMoveOrderProvider)
