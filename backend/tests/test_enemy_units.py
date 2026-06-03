"""Tests for enemy units (v2 Wave 3, enemy-red-nato-units)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.providers.enemy_units import (
    NoneEnemyUnitProvider,
    SeededEnemyUnitProvider,
    UnknownEnemyUnitProviderError,
    build_enemy_unit_provider,
)


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(create_app()) as c:
        yield c


class TestEnemyUnitProviderFactory:
    def test_seed_has_units(self) -> None:
        provider = build_enemy_unit_provider(Settings(enemy_unit_provider="seed"))
        assert isinstance(provider, SeededEnemyUnitProvider)
        assert len(provider.units()) >= 1

    def test_all_seeded_sidcs_are_20_digit_hostile(self) -> None:
        for u in SeededEnemyUnitProvider().units():
            assert len(u.sidc) == 20 and u.sidc.isdigit()
            # Standard identity digit (position 4) = 6 → hostile.
            assert u.sidc[3] == "6"

    def test_none_is_empty(self) -> None:
        provider = build_enemy_unit_provider(Settings(enemy_unit_provider="none"))
        assert isinstance(provider, NoneEnemyUnitProvider)
        assert provider.units() == ()

    def test_unknown_raises(self) -> None:
        with pytest.raises(UnknownEnemyUnitProviderError):
            build_enemy_unit_provider(Settings(enemy_unit_provider="nope"))


class TestEnemyUnitsApi:
    def test_lists_seeded_enemy_units(self, client: TestClient) -> None:
        resp = client.get("/api/v1/enemy-units")
        assert resp.status_code == 200
        body = resp.json()
        assert len(body) == len(SeededEnemyUnitProvider().units())
        first = body[0]
        assert {"id", "name", "sidc", "lat", "lon"} <= set(first)
        assert first["sidc"][3] == "6"  # hostile
