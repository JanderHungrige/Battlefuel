"""Buy order creation + sim-driven delivery (Wave 5 Feature 4: buy-orders).

``advance_buy_order`` is a pure countdown helper (deterministic tests). ``create_buy_order``
validates the target depot/stock row; ``deliver_due_buy_orders`` is called each sim tick to
count down active orders and deliver those that come due (increasing depot stock via the
supply provider's ``adjust_stock`` — never a raw UPDATE).
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.buy_order import BuyOrder, BuyOrderStatus
from app.domain.unit import FuelType
from app.providers.buy_orders import BuyOrderProvider
from app.providers.supply import SupplyProvider


def advance_buy_order(remaining_game_s: float, dt_game_s: float) -> tuple[float, bool]:
    """Return ``(new_remaining, delivered)`` after one game-time step."""
    new_remaining = max(0.0, remaining_game_s - dt_game_s)
    return new_remaining, new_remaining <= 0.0


async def create_buy_order(
    session: AsyncSession,
    supply: SupplyProvider,
    orders: BuyOrderProvider,
    *,
    depot_id: str,
    fuel_type: FuelType,
    quantity_liters: float,
    lead_time_game_s: float,
) -> BuyOrder | None:
    """Create a pending buy order.

    Raises ``LookupError`` if the depot is unknown (API → 404). Returns ``None`` if the depot has
    no stock row for ``fuel_type`` (API → 422), since delivery targets an existing stock row.
    """
    depot = await supply.get_depot(session, depot_id)
    if depot is None:
        raise LookupError(f"depot {depot_id!r} not found")
    if await supply.get_stock(session, depot_id, fuel_type) is None:
        return None
    order = BuyOrder(
        id=uuid.uuid4().hex,
        depot_id=depot_id,
        fuel_type=fuel_type,
        quantity_liters=quantity_liters,
        status=BuyOrderStatus.PENDING,
        lead_time_game_s=lead_time_game_s,
        remaining_game_s=lead_time_game_s,
    )
    return await orders.create(session, order)


async def deliver_due_buy_orders(
    session: AsyncSession,
    supply: SupplyProvider,
    orders: BuyOrderProvider,
    dt_game_s: float,
) -> list[BuyOrder]:
    """Advance every active buy order by ``dt_game_s``; deliver those that come due.

    Delivered orders increase depot stock via ``adjust_stock`` and are returned (so the caller
    can broadcast a frame per delivery).
    """
    delivered: list[BuyOrder] = []
    for order in await orders.list_active(session):
        new_remaining, is_due = advance_buy_order(order.remaining_game_s, dt_game_s)
        if is_due:
            await supply.adjust_stock(
                session, order.depot_id, order.fuel_type, order.quantity_liters
            )
            done = await orders.mark_delivered(session, order.id)
            if done is not None:
                delivered.append(done)
        else:
            await orders.set_remaining(session, order.id, new_remaining)
    return delivered
