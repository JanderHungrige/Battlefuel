"""Place blue and red forces from the unit-type catalog (v2 Wave 22 F1, scenario-force-placement).

The scenario creator picks a unit *type* and a point; this turns that into a concrete placement —
a friendly ``UnitInstance`` or a hostile ``EnemyUnit`` (same catalog, affiliation flipped). The
factory-pattern entry point keeps the unit catalog data-driven. Pure construction over the catalog
+ H3; persistence is the caller's (the providers). Newly placed units default to **half** fuel
capacity (F2, ``HALF_FUEL_FRACTION``).
"""

from __future__ import annotations

import uuid
from typing import Final

import h3

from app.domain.enemy_unit import EnemyUnit, to_hostile_sidc
from app.domain.unit import UnitType
from app.domain.unit_instance import InstanceStatus, UnitInstance
from app.services.tile_grid import DEFAULT_RESOLUTION

# Fraction of a unit type's tank a freshly placed unit starts with (v2 Wave 22 F2,
# scenario-default-half-fuel). Half-full is the scenario-builder default so a hand-built start has
# units that must plan refuelling, not full tanks.
HALF_FUEL_FRACTION: Final[float] = 0.5


def half_fuel_for(unit_type: UnitType) -> float:
    """Half the unit type's fuel capacity, rounded to a litre (0 for no-fuel/dismounted types)."""
    return round(unit_type.fuel.capacity_liters * HALF_FUEL_FRACTION, 1)


def place_unit_instance(
    unit_type: UnitType, lat: float, lon: float, name: str | None = None
) -> UnitInstance:
    """Build a friendly placed instance of ``unit_type`` at the point — half fuel + operational."""
    return UnitInstance(
        id=f"inst-{uuid.uuid4().hex[:12]}",
        name=name or unit_type.name,
        unit_type_id=unit_type.id,
        lat=lat,
        lon=lon,
        h3_index=h3.latlng_to_cell(lat, lon, DEFAULT_RESOLUTION),
        status=InstanceStatus.OPERATIONAL,
        current_fuel_liters=half_fuel_for(unit_type),
    )


def place_enemy_unit(
    unit_type: UnitType, lat: float, lon: float, name: str | None = None
) -> EnemyUnit:
    """Build a hostile placed unit from ``unit_type`` at the point (affiliation flipped red)."""
    return EnemyUnit(
        id=f"enemy-{uuid.uuid4().hex[:12]}",
        name=name or f"OPFOR {unit_type.name}",
        sidc=to_hostile_sidc(unit_type.sidc),
        lat=lat,
        lon=lon,
        echelon=unit_type.echelon.value,
    )
