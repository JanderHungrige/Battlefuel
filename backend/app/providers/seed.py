"""The seed-data unit provider (Feature 3: seed-unit-catalog).

Serves the bundled catalog from memory — no database required. It registers itself
under the name ``"seed"`` so the factory can build it from config. A PostgreSQL/PostGIS
provider will register under its own name in a later wave without touching this code.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.domain.unit import UnitType
from app.providers.base import UnitDataProvider
from app.providers.factory import register_provider
from app.providers.seed_data import SEED_UNITS


class SeedUnitProvider(UnitDataProvider):
    """In-memory provider backed by the seeded NATO unit catalog."""

    def __init__(self, units: Sequence[UnitType] = SEED_UNITS) -> None:
        self._units: tuple[UnitType, ...] = tuple(units)
        self._by_id: dict[str, UnitType] = {u.id: u for u in self._units}
        if len(self._by_id) != len(self._units):
            raise ValueError("duplicate unit id in seed catalog")

    def list_units(self) -> Sequence[UnitType]:
        return self._units

    def get_unit(self, unit_id: str) -> UnitType | None:
        return self._by_id.get(unit_id)


register_provider("seed", SeedUnitProvider)
