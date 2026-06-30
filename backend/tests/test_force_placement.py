"""Tests for scenario force placement (v2 Wave 22 F1 scenario-force-placement + F2 half-fuel).

Pure construction over the catalog — no DB. Uses a real catalog unit type so the SIDC flip and
half-fuel default are exercised against actual data.
"""

from __future__ import annotations

from app.domain.enemy_unit import to_hostile_sidc
from app.domain.unit_instance import InstanceStatus
from app.providers.factory import build_unit_provider
from app.services.force_placement import (
    HALF_FUEL_FRACTION,
    half_fuel_for,
    place_enemy_unit,
    place_unit_instance,
)

_ARMOR = build_unit_provider().get_unit("armor-tank-coy")
assert _ARMOR is not None  # catalog invariant the tests rely on


class TestToHostileSidc:
    def test_flips_affiliation_digit_friend_to_hostile(self) -> None:
        # Friendly catalog SIDCs start 1003… (affiliation 3); hostile is 1006….
        assert _ARMOR.sidc.startswith("1003")
        hostile = to_hostile_sidc(_ARMOR.sidc)
        assert hostile.startswith("1006")
        assert len(hostile) == len(_ARMOR.sidc) == 20

    def test_short_string_is_unchanged(self) -> None:
        assert to_hostile_sidc("abc") == "abc"


class TestHalfFuel:
    def test_is_half_capacity(self) -> None:
        assert half_fuel_for(_ARMOR) == round(_ARMOR.fuel.capacity_liters * 0.5, 1)
        assert HALF_FUEL_FRACTION == 0.5


class TestPlaceUnitInstance:
    def test_friendly_placement_is_half_fuel_and_operational(self) -> None:
        inst = place_unit_instance(_ARMOR, 49.22, 11.85)
        assert inst.unit_type_id == "armor-tank-coy"
        assert inst.status is InstanceStatus.OPERATIONAL
        assert inst.current_fuel_liters == half_fuel_for(_ARMOR)
        assert inst.id.startswith("inst-")
        assert inst.h3_index  # resolved from lat/lon
        assert inst.name == _ARMOR.name  # defaults to the type name

    def test_explicit_name_is_kept(self) -> None:
        assert place_unit_instance(_ARMOR, 49.22, 11.85, "COBRA").name == "COBRA"

    def test_ids_are_unique(self) -> None:
        a = place_unit_instance(_ARMOR, 49.22, 11.85)
        b = place_unit_instance(_ARMOR, 49.22, 11.85)
        assert a.id != b.id


class TestPlaceEnemyUnit:
    def test_hostile_sidc_and_echelon(self) -> None:
        enemy = place_enemy_unit(_ARMOR, 49.24, 11.86)
        assert enemy.sidc == to_hostile_sidc(_ARMOR.sidc)
        assert enemy.echelon == _ARMOR.echelon.value
        assert enemy.id.startswith("enemy-")
        assert enemy.name == f"OPFOR {_ARMOR.name}"

    def test_explicit_name_is_kept(self) -> None:
        assert place_enemy_unit(_ARMOR, 49.24, 11.86, "RED-1").name == "RED-1"
