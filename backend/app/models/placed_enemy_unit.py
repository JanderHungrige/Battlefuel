"""ORM model for the ``placed_enemy_units`` table (v2 Wave 22 F1, scenario-force-placement).

Operator-placed red forces. Mirrors the ``EnemyUnit`` domain shape (a 20-digit hostile SIDC +
position + display echelon) so the same render/danger pipeline serves seeded, chatter, and placed
hostiles. Persisted so they survive reload and can be snapshotted by save/load (F5).
"""

from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class PlacedEnemyUnitRow(Base):
    __tablename__ = "placed_enemy_units"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    sidc: Mapped[str]
    lat: Mapped[float]
    lon: Mapped[float]
    echelon: Mapped[str | None] = mapped_column(default=None)
