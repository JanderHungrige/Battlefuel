"""ORM model for the ``unit_instances`` table (Feature 4).

``unit_type_id`` references a catalog ``UnitType`` by id. The catalog is served from the
seed provider (not a DB table), so there is no DB foreign key; validity is enforced when
instances are created/seeded.
"""

from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class UnitInstanceRow(Base):
    __tablename__ = "unit_instances"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    unit_type_id: Mapped[str]
    lat: Mapped[float]
    lon: Mapped[float]
    h3_index: Mapped[str]
    status: Mapped[str] = mapped_column(default="operational")
    current_fuel_liters: Mapped[float | None] = mapped_column(default=None)
