"""Buy order creation + sim-driven delivery (Wave 5 Feature 4: buy-orders).

``advance_buy_order`` is a pure countdown helper (deterministic tests). ``create_buy_order``
validates the target depot/stock row; ``deliver_due_buy_orders`` is called each sim tick to
count down active orders and deliver those that come due (increasing depot stock via the
supply provider's ``adjust_stock`` — never a raw UPDATE).
"""

from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.buy_order import (
    ORDER_STAGE_SECONDS,
    BuyOrder,
    BuyOrderStatus,
    NatoStage,
    is_terminal_stage,
    next_nato_stage,
)
from app.domain.unit import FuelType
from app.providers.buy_orders import BuyOrderProvider
from app.providers.supply import SupplyProvider


def advance_buy_order(remaining_game_s: float, dt_game_s: float) -> tuple[float, bool]:
    """Return ``(new_remaining, delivered)`` after one game-time step."""
    new_remaining = max(0.0, remaining_game_s - dt_game_s)
    return new_remaining, new_remaining <= 0.0


def advance_order_stage(
    stage: NatoStage,
    stage_remaining_game_s: float,
    dt_game_s: float,
    stage_seconds: float = ORDER_STAGE_SECONDS,
) -> tuple[NatoStage, float, bool]:
    """Advance the NATO fulfilment stage by ``dt_game_s`` (pure, deterministic).

    Returns ``(new_stage, new_stage_remaining, reached_terminal)``. A single large ``dt`` can
    cross several stages. ``reached_terminal`` is True only on the step that first arrives at
    ``REACHED_OPCON`` (so the caller delivers stock exactly once).
    """
    if is_terminal_stage(stage):
        return stage, 0.0, False
    remaining = stage_remaining_game_s - dt_game_s
    reached_terminal = False
    while remaining <= 0.0 and not is_terminal_stage(stage):
        nxt = next_nato_stage(stage)
        if nxt is None:
            break
        stage = nxt
        if is_terminal_stage(stage):
            remaining = 0.0
            reached_terminal = True
            break
        remaining += stage_seconds
    return stage, max(0.0, remaining), reached_terminal


async def create_buy_order(
    session: AsyncSession,
    supply: SupplyProvider,
    orders: BuyOrderProvider,
    *,
    depot_id: str,
    fuel_type: FuelType,
    quantity_liters: float,
    lead_time_game_s: float,
    platform_id: str | None = None,
    inform_jlsg: bool = False,
    inform_jtf: bool = False,
    destination_name: str | None = None,
) -> BuyOrder | None:
    """Create a pending buy order.

    Raises ``LookupError`` if the depot is unknown (API → 404). Returns ``None`` if the depot has
    no stock row for ``fuel_type`` (API → 422), since delivery targets an existing stock row.
    The order-mask metadata (platform / inform flags / destination label) is persisted for the
    order-history panel (v2 Wave 11 F3).
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
        platform_id=platform_id,
        inform_jlsg=inform_jlsg,
        inform_jtf=inform_jtf,
        destination_name=destination_name or depot.name,
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


async def progress_buy_order_stages(
    session: AsyncSession,
    supply: SupplyProvider,
    orders: BuyOrderProvider,
    dt_game_s: float,
) -> list[BuyOrder]:
    """Advance the NATO fulfilment stage of every active order by ``dt_game_s``.

    This is the live-sim order lifecycle (v2 Wave 11 F4): each stage dwells ``ORDER_STAGE_SECONDS``
    game-seconds, and arriving at ``REACHED_OPCON`` delivers the fuel (increasing depot stock via
    ``adjust_stock`` — never a raw UPDATE) and marks the order delivered. Returns every order whose
    stage changed this step, so the caller can broadcast one frame per change.
    """
    changed: list[BuyOrder] = []
    for order in await orders.list_active(session):
        new_stage, new_remaining, reached_terminal = advance_order_stage(
            order.nato_stage, order.stage_remaining_game_s, dt_game_s
        )
        if reached_terminal:
            await supply.adjust_stock(
                session, order.depot_id, order.fuel_type, order.quantity_liters
            )
            done = await orders.mark_delivered(session, order.id)
            if done is not None:
                changed.append(done)
        elif new_stage is not order.nato_stage:
            updated = await orders.set_stage(session, order.id, new_stage, new_remaining)
            if updated is not None:
                changed.append(updated)
        else:
            # Same stage, just less dwell time left — persist the countdown, no broadcast.
            await orders.set_stage(session, order.id, new_stage, new_remaining)
    return changed
