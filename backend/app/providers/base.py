"""The data-source abstraction (Feature 2: data-source-factory).

``UnitDataProvider`` is the single boundary every consumer of unit data talks to.
Concrete providers (seed data now; PostgreSQL/live streams later) implement it, and
the factory decides which one to build from config. Game logic never imports a
concrete provider directly — that is what keeps the data layer swappable.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Sequence

from app.domain.unit import UnitType


class UnitDataProvider(ABC):
    """Read access to the catalog of NATO unit types."""

    @abstractmethod
    def list_units(self) -> Sequence[UnitType]:
        """Return every unit type known to this source."""

    @abstractmethod
    def get_unit(self, unit_id: str) -> UnitType | None:
        """Return a single unit type by id, or ``None`` if it is not present."""
