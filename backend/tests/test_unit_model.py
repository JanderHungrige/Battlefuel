"""Tests for the unit-type domain model (Feature 1: unit-stats-model)."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.unit import (
    ArmorClass,
    CombatProfile,
    Echelon,
    FuelProfile,
    FuelType,
    MovementProfile,
    NatoUnitType,
    ReconLevel,
    UnitType,
)


def _valid_fuel(**overrides: object) -> FuelProfile:
    base: dict[str, object] = dict(
        fuel_type=FuelType.DIESEL,
        capacity_liters=1200.0,
        consumption_normal_lph=60.0,
        consumption_combat_lph=110.0,
        consumption_idle_lph=8.0,
    )
    base.update(overrides)
    return FuelProfile(**base)  # type: ignore[arg-type]


def _valid_unit(**overrides: object) -> UnitType:
    base: dict[str, object] = dict(
        id="armor-tank-coy",
        name="Tank Company",
        nato_unit_type=NatoUnitType.ARMOR,
        echelon=Echelon.COMPANY,
        sidc="10031000001204",
        recon_level=ReconLevel.LOW,
        fuel=_valid_fuel(),
        movement=MovementProfile(
            speed_road_kph=60.0,
            speed_offroad_kph=40.0,
            speed_combat_kph=25.0,
            operational_range_km=450.0,
        ),
        combat=CombatProfile(
            combat_power=85, armor_class=ArmorClass.HEAVY, crew=56, weight_tons=62.0
        ),
    )
    base.update(overrides)
    return UnitType(**base)  # type: ignore[arg-type]


class TestConstruction:
    def test_builds_a_valid_unit_type(self) -> None:
        unit = _valid_unit()
        assert unit.id == "armor-tank-coy"
        assert unit.nato_unit_type is NatoUnitType.ARMOR
        assert unit.fuel.fuel_type is FuelType.DIESEL

    def test_computes_endurance_from_capacity_and_burn(self) -> None:
        unit = _valid_unit()
        # 1200 / 60 = 20h normal; 1200 / 110 = 10.91h combat
        assert unit.endurance_hours_normal == 20.0
        assert unit.endurance_hours_combat == pytest.approx(10.91, abs=0.01)

    def test_endurance_is_none_when_no_fuel_demand(self) -> None:
        unit = _valid_unit(
            fuel=_valid_fuel(
                fuel_type=FuelType.NONE,
                capacity_liters=0.0,
                consumption_normal_lph=0.0,
                consumption_combat_lph=0.0,
                consumption_idle_lph=0.0,
            )
        )
        assert unit.endurance_hours_normal is None
        assert unit.endurance_hours_combat is None


class TestInvariants:
    def test_rejects_combat_burn_below_normal(self) -> None:
        with pytest.raises(ValidationError, match="combat >= normal >= idle"):
            _valid_fuel(consumption_combat_lph=10.0, consumption_normal_lph=60.0)

    def test_rejects_normal_burn_below_idle(self) -> None:
        with pytest.raises(ValidationError, match="combat >= normal >= idle"):
            _valid_fuel(consumption_normal_lph=5.0, consumption_idle_lph=8.0)

    def test_rejects_fuelless_unit_with_capacity(self) -> None:
        with pytest.raises(ValidationError, match="capacity_liters == 0"):
            _valid_fuel(
                fuel_type=FuelType.NONE,
                capacity_liters=500.0,
                consumption_normal_lph=0.0,
                consumption_combat_lph=0.0,
                consumption_idle_lph=0.0,
            )

    def test_rejects_road_slower_than_offroad(self) -> None:
        with pytest.raises(ValidationError, match="speed_road_kph must be >="):
            MovementProfile(
                speed_road_kph=20.0,
                speed_offroad_kph=40.0,
                speed_combat_kph=10.0,
                operational_range_km=300.0,
            )

    def test_rejects_negative_capacity(self) -> None:
        with pytest.raises(ValidationError):
            _valid_fuel(capacity_liters=-1.0)

    def test_rejects_bad_id_slug(self) -> None:
        with pytest.raises(ValidationError):
            _valid_unit(id="Bad ID!")

    def test_rejects_malformed_sidc(self) -> None:
        with pytest.raises(ValidationError):
            _valid_unit(sidc="short")


class TestImmutability:
    def test_unit_type_is_frozen(self) -> None:
        unit = _valid_unit()
        with pytest.raises(ValidationError):
            unit.name = "Renamed"  # type: ignore[misc]

    def test_fuel_profile_is_frozen(self) -> None:
        fuel = _valid_fuel()
        with pytest.raises(ValidationError):
            fuel.capacity_liters = 9999.0  # type: ignore[misc]
