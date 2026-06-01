"""ORM model for the ``obstacles`` table (Wave 4, manual-obstacles).

An obstacle blocks an H3 cell: routing excludes every edge whose ``cell_h3`` matches an
obstacle's ``h3_index``, so new routes avoid it.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ObstacleRow(Base):
    __tablename__ = "obstacles"

    id: Mapped[str] = mapped_column(primary_key=True)
    h3_index: Mapped[str] = mapped_column(index=True)
    kind: Mapped[str] = mapped_column(default="manual")
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
