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
