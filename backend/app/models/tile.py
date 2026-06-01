"""ORM model for the ``tiles`` table (Feature 3).

Attributes are stored as their string enum values. Geometry is intentionally absent —
H3 provides cell identity, neighbours, and boundary; see app.domain.tile.
"""

from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class TileRow(Base):
    __tablename__ = "tiles"

    h3_index: Mapped[str] = mapped_column(primary_key=True)
    resolution: Mapped[int]
    center_lat: Mapped[float]
    center_lon: Mapped[float]
    terrain: Mapped[str]
    threat_level: Mapped[int] = mapped_column(default=0)
    intel_level: Mapped[str] = mapped_column(default="none")
    weather: Mapped[str] = mapped_column(default="clear")
    road_condition: Mapped[str] = mapped_column(default="clear")
    cover: Mapped[str] = mapped_column(default="none")
    situation: Mapped[str | None] = mapped_column(default=None)  # Wave 4: operator sector status
    note: Mapped[str | None] = mapped_column(default=None)  # Wave 4: free-text sector note
