"""Tests for enemy-proximity routing danger (v2 Wave 16, enemy-avoidance-cost)."""

from __future__ import annotations

from app.domain.enemy_unit import EnemyUnit
from app.services.enemy_danger import (
    ECHELON_RADIUS_M,
    enemy_threat_at,
    radius_for,
)

# A hostile company near the theater centre.
_COY = EnemyUnit(id="e1", name="OPFOR", sidc="1" * 20, lat=49.225, lon=11.860, echelon="company")


class TestRadiusFor:
    def test_known_echelons_scale_up(self) -> None:
        assert radius_for("section") < radius_for("platoon") < radius_for("company")

    def test_unknown_or_none_uses_default(self) -> None:
        d = radius_for(None)
        assert d == radius_for("not-an-echelon") == radius_for("")
        # default sits between the small and large echelons
        assert ECHELON_RADIUS_M["section"] <= d <= ECHELON_RADIUS_M["company"]

    def test_case_insensitive(self) -> None:
        assert radius_for("Company") == radius_for("company")


class TestEnemyThreatAt:
    def test_peak_at_the_centre(self) -> None:
        assert enemy_threat_at(_COY.lat, _COY.lon, [_COY]) == 5

    def test_zero_outside_every_circle(self) -> None:
        # ~5 km north — well beyond the company radius.
        assert enemy_threat_at(49.27, 11.860, [_COY]) == 0

    def test_falls_off_with_distance(self) -> None:
        near = enemy_threat_at(49.227, 11.860, [_COY])  # ~220 m
        far = enemy_threat_at(49.232, 11.860, [_COY])  # ~780 m, still inside ~1200 m
        assert 0 < far < near <= 5

    def test_no_enemies_is_zero(self) -> None:
        assert enemy_threat_at(49.225, 11.860, []) == 0

    def test_takes_the_max_over_units(self) -> None:
        far_section = EnemyUnit(
            id="e2", name="OPFOR2", sidc="1" * 20, lat=49.226, lon=11.861, echelon="section"
        )
        # The company (peak 5 at its centre) dominates the nearby section.
        assert enemy_threat_at(_COY.lat, _COY.lon, [far_section, _COY]) == 5

    def test_returns_an_int_in_range(self) -> None:
        for lat in (49.22, 49.225, 49.23, 49.26):
            v = enemy_threat_at(lat, 11.86, [_COY])
            assert isinstance(v, int) and 0 <= v <= 5
