"""ORM model for the ``rendezvous_orders`` table (v2 Wave 13 F2)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class RendezvousOrderRow(Base):
    __tablename__ = "rendezvous_orders"

    id: Mapped[str] = mapped_column(primary_key=True)
    truck_id: Mapped[str]
    unit_id: Mapped[str]
    sector_lat: Mapped[float]
    sector_lon: Mapped[float]
    sector_h3: Mapped[str]
    metric: Mapped[str]
    mode: Mapped[str]
    scheduled_game_s: Mapped[float]
    remaining_game_s: Mapped[float]
    truck_geometry: Mapped[list[list[float]]] = mapped_column(JSONB)
    unit_geometry: Mapped[list[list[float]]] = mapped_column(JSONB)
    truck_fuel_to_meet: Mapped[float] = mapped_column(default=0.0)
    unit_fuel_to_meet: Mapped[float] = mapped_column(default=0.0)
    status: Mapped[str] = mapped_column(default="planned")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
