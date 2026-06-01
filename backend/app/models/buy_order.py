"""ORM model for the ``buy_orders`` table (Wave 5 Feature 4: buy-orders)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class BuyOrderRow(Base):
    __tablename__ = "buy_orders"

    id: Mapped[str] = mapped_column(primary_key=True)
    depot_id: Mapped[str]
    fuel_type: Mapped[str]
    quantity_liters: Mapped[float]
    status: Mapped[str] = mapped_column(default="pending")
    lead_time_game_s: Mapped[float]
    remaining_game_s: Mapped[float]
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
