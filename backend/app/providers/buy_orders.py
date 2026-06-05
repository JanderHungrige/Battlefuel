"""Buy-order persistence providers and factory (Wave 5 Feature 4: buy-orders)."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.domain.buy_order import BuyOrder, BuyOrderStatus
from app.domain.unit import FuelType
from app.models.buy_order import BuyOrderRow


def _to_order(row: BuyOrderRow) -> BuyOrder:
    return BuyOrder(
        id=row.id,
        depot_id=row.depot_id,
        fuel_type=FuelType(row.fuel_type),
        quantity_liters=row.quantity_liters,
        status=BuyOrderStatus(row.status),
        lead_time_game_s=row.lead_time_game_s,
        remaining_game_s=row.remaining_game_s,
        platform_id=row.platform_id,
        inform_jlsg=row.inform_jlsg,
        inform_jtf=row.inform_jtf,
        destination_name=row.destination_name,
    )


class BuyOrderProvider(ABC):
    @abstractmethod
    async def create(self, session: AsyncSession, order: BuyOrder) -> BuyOrder: ...

    @abstractmethod
    async def get(self, session: AsyncSession, order_id: str) -> BuyOrder | None: ...

    @abstractmethod
    async def list_all(self, session: AsyncSession) -> Sequence[BuyOrder]: ...

    @abstractmethod
    async def list_active(self, session: AsyncSession) -> Sequence[BuyOrder]: ...

    @abstractmethod
    async def set_status(
        self, session: AsyncSession, order_id: str, status: BuyOrderStatus
    ) -> BuyOrder | None: ...

    @abstractmethod
    async def set_remaining(
        self, session: AsyncSession, order_id: str, remaining_game_s: float
    ) -> None: ...

    @abstractmethod
    async def mark_delivered(self, session: AsyncSession, order_id: str) -> BuyOrder | None: ...


class DbBuyOrderProvider(BuyOrderProvider):
    async def create(self, session: AsyncSession, order: BuyOrder) -> BuyOrder:
        session.add(
            BuyOrderRow(
                id=order.id,
                depot_id=order.depot_id,
                fuel_type=order.fuel_type.value,
                quantity_liters=order.quantity_liters,
                status=order.status.value,
                lead_time_game_s=order.lead_time_game_s,
                remaining_game_s=order.remaining_game_s,
                platform_id=order.platform_id,
                inform_jlsg=order.inform_jlsg,
                inform_jtf=order.inform_jtf,
                destination_name=order.destination_name,
            )
        )
        await session.commit()
        return order

    async def get(self, session: AsyncSession, order_id: str) -> BuyOrder | None:
        row = await session.get(BuyOrderRow, order_id)
        return _to_order(row) if row is not None else None

    async def list_all(self, session: AsyncSession) -> Sequence[BuyOrder]:
        rows = (await session.execute(select(BuyOrderRow))).scalars().all()
        return [_to_order(r) for r in rows]

    async def list_active(self, session: AsyncSession) -> Sequence[BuyOrder]:
        stmt = select(BuyOrderRow).where(BuyOrderRow.status == BuyOrderStatus.ACTIVE.value)
        rows = (await session.execute(stmt)).scalars().all()
        return [_to_order(r) for r in rows]

    async def set_status(
        self, session: AsyncSession, order_id: str, status: BuyOrderStatus
    ) -> BuyOrder | None:
        row = await session.get(BuyOrderRow, order_id)
        if row is None:
            return None
        row.status = status.value
        await session.commit()
        return _to_order(row)

    async def set_remaining(
        self, session: AsyncSession, order_id: str, remaining_game_s: float
    ) -> None:
        row = await session.get(BuyOrderRow, order_id)
        if row is None:
            return
        row.remaining_game_s = remaining_game_s
        await session.commit()

    async def mark_delivered(self, session: AsyncSession, order_id: str) -> BuyOrder | None:
        row = await session.get(BuyOrderRow, order_id)
        if row is None:
            return None
        row.status = BuyOrderStatus.DELIVERED.value
        row.remaining_game_s = 0.0
        await session.commit()
        return _to_order(row)


BuyOrderProviderBuilder = Callable[[], BuyOrderProvider]
_REGISTRY: dict[str, BuyOrderProviderBuilder] = {}


class UnknownBuyOrderProviderError(ValueError):
    """Raised when config names a buy-order provider that is not registered."""


def register_buy_order_provider(name: str, builder: BuyOrderProviderBuilder) -> None:
    _REGISTRY[name] = builder


def build_buy_order_provider(settings: Settings | None = None) -> BuyOrderProvider:
    settings = settings or get_settings()
    try:
        builder = _REGISTRY[settings.buy_order_provider]
    except KeyError as exc:
        raise UnknownBuyOrderProviderError(
            f"unknown buy-order provider {settings.buy_order_provider!r}; "
            f"available: {sorted(_REGISTRY)}"
        ) from exc
    return builder()


register_buy_order_provider("db", DbBuyOrderProvider)
