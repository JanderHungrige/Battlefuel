"""Domain model for a NATO unit *type* (a catalog template).

Wave 1 models unit *types* — reusable templates carrying stat baselines. Placed
unit *instances* (map position, live fuel level) arrive in a later wave.

All values are **illustrative/approximate**, not authoritative or operational.

Models are frozen: a catalog entry is an immutable template. Sub-profiles group
related stats so the model stays readable and individually testable.
"""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, computed_field, model_validator


class NatoUnitType(StrEnum):
    """Broad NATO functional unit categories."""

    ARMOR = "armor"
    MECHANIZED_INFANTRY = "mechanized_infantry"
    INFANTRY = "infantry"
    ARTILLERY = "artillery"
    RECONNAISSANCE = "reconnaissance"
    LOGISTICS = "logistics"
    FUEL_SUPPLY = "fuel_supply"
    ENGINEER = "engineer"
    AIR_DEFENSE = "air_defense"
    SIGNAL = "signal"
    MEDICAL = "medical"
    HEADQUARTERS = "headquarters"


class Echelon(StrEnum):
    """NATO command echelons, smallest to largest."""

    TEAM = "team"
    SQUAD = "squad"
    SECTION = "section"
    PLATOON = "platoon"
    COMPANY = "company"
    BATTALION = "battalion"
    BRIGADE = "brigade"
    DIVISION = "division"


class FuelType(StrEnum):
    """Fuel an organic vehicle fleet consumes."""

    DIESEL = "diesel"
    JP8 = "jp8"
    GASOLINE = "gasoline"
    JET_A1 = "jet_a1"
    ELECTRIC = "electric"
    NONE = "none"  # dismounted / no organic fuel demand


class ArmorClass(StrEnum):
    NONE = "none"
    LIGHT = "light"
    MEDIUM = "medium"
    HEAVY = "heavy"


class ReconLevel(StrEnum):
    NONE = "none"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class FuelProfile(BaseModel):
    """Fuel capacity and consumption rates for a unit type.

    Consumption is expressed in litres per hour for three operating modes.
    Invariant: ``combat >= normal >= idle`` (combat burns the most).
    """

    model_config = ConfigDict(frozen=True)

    fuel_type: FuelType
    capacity_liters: float = Field(ge=0)
    consumption_normal_lph: float = Field(ge=0)
    consumption_combat_lph: float = Field(ge=0)
    consumption_idle_lph: float = Field(ge=0)

    @model_validator(mode="after")
    def _check_invariants(self) -> FuelProfile:
        if not (
            self.consumption_combat_lph >= self.consumption_normal_lph >= self.consumption_idle_lph
        ):
            raise ValueError("fuel consumption must satisfy combat >= normal >= idle")
        if self.fuel_type is FuelType.NONE and self.capacity_liters != 0:
            raise ValueError("fuel_type 'none' requires capacity_liters == 0")
        return self

    def _endurance(self, consumption_lph: float) -> float | None:
        """Hours the unit can operate at a given burn rate, or None if it never runs dry."""
        if consumption_lph <= 0:
            return None
        return round(self.capacity_liters / consumption_lph, 2)


class MovementProfile(BaseModel):
    """Speeds and range for a unit type.

    Invariant: ``speed_road_kph >= speed_offroad_kph``.
    """

    model_config = ConfigDict(frozen=True)

    speed_road_kph: float = Field(ge=0)
    speed_offroad_kph: float = Field(ge=0)
    speed_combat_kph: float = Field(ge=0)
    operational_range_km: float = Field(ge=0)

    @model_validator(mode="after")
    def _check_invariants(self) -> MovementProfile:
        if self.speed_road_kph < self.speed_offroad_kph:
            raise ValueError("speed_road_kph must be >= speed_offroad_kph")
        return self


class CombatProfile(BaseModel):
    """Combat-relevant attributes for a unit type."""

    model_config = ConfigDict(frozen=True)

    combat_power: int = Field(ge=0, description="Abstract relative combat strength score")
    armor_class: ArmorClass
    crew: int = Field(ge=0)
    weight_tons: float = Field(ge=0)


class UnitType(BaseModel):
    """A NATO unit type — the catalog template other systems build instances from."""

    model_config = ConfigDict(frozen=True)

    id: str = Field(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", description="kebab-case slug")
    name: str = Field(min_length=1)
    nato_unit_type: NatoUnitType
    echelon: Echelon
    # APP-6 / MIL-STD-2525 Symbol Identification Code — consumed by milsymbol in Wave 2.
    sidc: str = Field(pattern=r"^[A-Za-z0-9]{10,20}$")
    recon_level: ReconLevel
    fuel: FuelProfile
    movement: MovementProfile
    combat: CombatProfile
    description: str | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def endurance_hours_normal(self) -> float | None:
        """Operating hours at the normal burn rate (None if no fuel demand)."""
        return self.fuel._endurance(self.fuel.consumption_normal_lph)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def endurance_hours_combat(self) -> float | None:
        """Operating hours at the combat burn rate (None if no fuel demand)."""
        return self.fuel._endurance(self.fuel.consumption_combat_lph)
