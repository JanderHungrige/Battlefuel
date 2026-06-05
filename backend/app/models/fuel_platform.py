"""ORM model for the ``fuel_platforms`` table (v2 Wave 11 Feature 2: fuel-platform-selector)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FuelPlatformRow(Base):
    __tablename__ = "fuel_platforms"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    logo_key: Mapped[str | None] = mapped_column(default=None)
    is_default: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
