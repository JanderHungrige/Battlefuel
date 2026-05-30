"""Tests for the seeded catalog and provider (Feature 3: seed-unit-catalog)."""

from __future__ import annotations

import pytest

from app.domain.unit import FuelType, NatoUnitType, UnitType
from app.providers.seed import SeedUnitProvider
from app.providers.seed_data import SEED_UNITS


@pytest.fixture
def provider() -> SeedUnitProvider:
    return SeedUnitProvider()


def test_catalog_is_non_empty_and_typed() -> None:
    assert len(SEED_UNITS) >= 10
    assert all(isinstance(u, UnitType) for u in SEED_UNITS)


def test_all_ids_are_unique() -> None:
    ids = [u.id for u in SEED_UNITS]
    assert len(ids) == len(set(ids))


def test_lists_every_seeded_unit(provider: SeedUnitProvider) -> None:
    assert len(provider.list_units()) == len(SEED_UNITS)


def test_get_unit_returns_match(provider: SeedUnitProvider) -> None:
    unit = provider.get_unit("armor-tank-coy")
    assert unit is not None
    assert unit.nato_unit_type is NatoUnitType.ARMOR


def test_get_unit_returns_none_for_missing(provider: SeedUnitProvider) -> None:
    assert provider.get_unit("no-such-unit") is None


def test_catalog_spans_several_categories() -> None:
    categories = {u.nato_unit_type for u in SEED_UNITS}
    # At minimum the supply-chain-relevant spread the game needs.
    assert {
        NatoUnitType.ARMOR,
        NatoUnitType.FUEL_SUPPLY,
        NatoUnitType.LOGISTICS,
        NatoUnitType.RECONNAISSANCE,
    } <= categories


def test_seed_sidcs_are_20_digit() -> None:
    assert all(len(u.sidc) == 20 and u.sidc.isdigit() for u in SEED_UNITS)


def test_fuelless_unit_has_no_endurance(provider: SeedUnitProvider) -> None:
    squad = provider.get_unit("inf-squad-dismounted")
    assert squad is not None
    assert squad.fuel.fuel_type is FuelType.NONE
    assert squad.endurance_hours_normal is None


def test_duplicate_ids_are_rejected() -> None:
    dup = (SEED_UNITS[0], SEED_UNITS[0])
    with pytest.raises(ValueError, match="duplicate unit id"):
        SeedUnitProvider(units=dup)
