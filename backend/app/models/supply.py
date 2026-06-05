"""ORM models for the fuel supply tables (Wave 5 Feature 1: fuel-supply-model).

``fuel_depots`` holds fixed supply locations; ``fuel_stocks`` holds per-(depot, fuel-type)
quantities with a composite primary key. ``depot_id`` references ``fuel_depots.id`` but, like
the rest of the project's seed-validated references, no DB foreign key is declared.
"""

from __future__ import annotations

from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class FuelDepotRow(Base):
    __tablename__ = "fuel_depots"

    id: Mapped[str] = mapped_column(primary_key=True)
    name: Mapped[str]
    h3_index: Mapped[str]
    lat: Mapped[float]
    lon: Mapped[float]
    # NATO JLSG site type (v2 Wave 11 F5); NULL for a plain depot/marker.
    site_type: Mapped[str | None] = mapped_column(default=None)


class FuelStockRow(Base):
    __tablename__ = "fuel_stocks"

    depot_id: Mapped[str] = mapped_column(primary_key=True)
    fuel_type: Mapped[str] = mapped_column(primary_key=True)
    quantity_liters: Mapped[float]
    capacity_liters: Mapped[float]
