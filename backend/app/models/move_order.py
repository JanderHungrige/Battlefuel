"""ORM model for the ``move_orders`` table (Wave 3, move-orders).

A move order is a unit's committed route. The sim engine (Feature 14) advances ``active``
orders by updating ``progress_m`` and the unit's fuel until arrival.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class MoveOrderRow(Base):
    __tablename__ = "move_orders"

    id: Mapped[str] = mapped_column(primary_key=True)
    instance_id: Mapped[str]
    status: Mapped[str] = mapped_column(default="pending")
    metric: Mapped[str]
    distance_m: Mapped[float]
    duration_s: Mapped[float]
    fuel_consumed_l: Mapped[float]
    progress_m: Mapped[float] = mapped_column(default=0.0)
    geometry: Mapped[list[list[float]]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
