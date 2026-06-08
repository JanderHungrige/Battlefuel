"""ORM model for the ``refuel_orders`` table (Wave 5 Feature 3: refuel-orders).

A refuel order pairs a thirsty unit with an assigned fuel truck (both ``UnitInstance``s). The
sim engine completes it when the two share an H3 cell, writing ``transferred_liters``.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RefuelOrderRow(Base):
    __tablename__ = "refuel_orders"

    id: Mapped[str] = mapped_column(primary_key=True)
    unit_id: Mapped[str]
    # Source is EITHER a mobile truck OR a fixed depot (v2 Wave 12 F2): exactly one is set.
    truck_id: Mapped[str | None] = mapped_column(default=None)
    depot_id: Mapped[str | None] = mapped_column(default=None)
    fuel_type: Mapped[str]
    status: Mapped[str] = mapped_column(default="pending")
    rendezvous_lat: Mapped[float]
    rendezvous_lon: Mapped[float]
    rendezvous_h3: Mapped[str]
    requested_liters: Mapped[float | None] = mapped_column(default=None)
    transferred_liters: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
