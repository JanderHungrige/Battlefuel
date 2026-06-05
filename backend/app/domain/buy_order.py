"""Domain model for buy orders (Wave 5 Feature 4: buy-orders).

A buy order procures fuel into a depot. Lead time is tracked as a countdown
(``remaining_game_s``) so it survives sim/process restarts; the sim decrements it each tick and
delivers when it reaches zero.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from app.domain.unit import FuelType


class BuyOrderStatus(StrEnum):
    PENDING = "pending"  # created, awaiting confirmation
    ACTIVE = "active"  # confirmed; the sim is counting it down
    DELIVERED = "delivered"  # stock added to the depot
    CANCELLED = "cancelled"


class NatoStage(StrEnum):
    """NATO fuel-order fulfilment stages (v2 Wave 11 F4), advanced on the sim clock.

    The order moves through these in sequence; reaching ``REACHED_OPCON`` is delivery.
    """

    PLACED = "placed"  # order placed
    CONFIRMED_JLSG = "confirmed_jlsg"  # confirmed by JLSG
    CONFIRMED_JTF = "confirmed_jtf"  # confirmed by JTF
    CONFIRMED_PROVIDER = "confirmed_provider"  # confirmed by fuel provider
    ON_ROUTE = "on_route"  # fuel on route
    REACHED_JLSG = "reached_jlsg"  # fuel reached JLSG
    REACHED_OPCON = "reached_opcon"  # fuel reached OPCON (delivered)


# Ordered progression and per-stage dwell time (game-seconds).
NATO_STAGE_ORDER: tuple[NatoStage, ...] = (
    NatoStage.PLACED,
    NatoStage.CONFIRMED_JLSG,
    NatoStage.CONFIRMED_JTF,
    NatoStage.CONFIRMED_PROVIDER,
    NatoStage.ON_ROUTE,
    NatoStage.REACHED_JLSG,
    NatoStage.REACHED_OPCON,
)
ORDER_STAGE_SECONDS: float = 30.0


def is_terminal_stage(stage: NatoStage) -> bool:
    return stage is NatoStage.REACHED_OPCON


def next_nato_stage(stage: NatoStage) -> NatoStage | None:
    """The stage after ``stage``, or ``None`` if already terminal."""
    idx = NATO_STAGE_ORDER.index(stage)
    nxt = idx + 1
    return NATO_STAGE_ORDER[nxt] if nxt < len(NATO_STAGE_ORDER) else None


class BuyOrder(BaseModel):
    """A committed fuel purchase into a depot, delivered after a lead time.

    Order-mask metadata (v2 Wave 11 F3): the fuel-management platform the order was placed
    through and who to inform (JLSG / JTF HQ), plus a human destination label.
    """

    model_config = ConfigDict(frozen=True)

    id: str
    depot_id: str
    fuel_type: FuelType
    quantity_liters: float = Field(ge=0)
    status: BuyOrderStatus
    lead_time_game_s: float = Field(ge=0)
    remaining_game_s: float = Field(ge=0)
    platform_id: str | None = None
    inform_jlsg: bool = False
    inform_jtf: bool = False
    destination_name: str | None = None
    nato_stage: NatoStage = NatoStage.PLACED
    stage_remaining_game_s: float = Field(default=ORDER_STAGE_SECONDS, ge=0)
