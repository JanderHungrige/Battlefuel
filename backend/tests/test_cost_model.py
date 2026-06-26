"""Tests for the tile-cost model (Wave 4 Feature 1: tile-cost-model)."""

from __future__ import annotations

import pytest

from app.domain.tile import RoadCondition, TerrainType
from app.services.cost_model import (
    BLOCKED_COST,
    THREAT_WEIGHT,
    TileFactors,
    edge_time_cost,
    safe_edge_cost,
    tile_factors,
)


class TestTileFactors:
    def test_open_clear_is_neutral(self) -> None:
        f = tile_factors(TerrainType.OPEN, RoadCondition.CLEAR)
        assert (f.speed_factor, f.fuel_factor) == (1.0, 1.0)
        assert f.passable is True

    def test_forest_slows_and_burns_more(self) -> None:
        f = tile_factors(TerrainType.FOREST, RoadCondition.CLEAR)
        assert f.speed_factor == pytest.approx(0.80)
        assert f.fuel_factor == pytest.approx(1.15)

    def test_terrain_and_road_combine_multiplicatively(self) -> None:
        f = tile_factors(TerrainType.FOREST, RoadCondition.DAMAGED)
        assert f.speed_factor == pytest.approx(0.80 * 0.50)
        assert f.fuel_factor == pytest.approx(1.15 * 1.30)

    def test_obstructed_is_a_passable_crawl(self) -> None:
        f = tile_factors(TerrainType.OPEN, RoadCondition.OBSTRUCTED)
        assert f.speed_factor == pytest.approx(0.15)  # doc 101: a crawl, not impassable
        assert f.passable is True


class TestEdgeCost:
    def test_time_cost_is_length_over_speed_factor(self) -> None:
        f = tile_factors(TerrainType.FOREST, RoadCondition.CLEAR)  # speed 0.80
        assert edge_time_cost(800.0, f) == pytest.approx(800.0 / 0.80)

    def test_open_clear_time_cost_equals_length(self) -> None:
        f = tile_factors(TerrainType.OPEN, RoadCondition.CLEAR)
        assert edge_time_cost(500.0, f) == pytest.approx(500.0)

    def test_obstructed_edge_is_finite_high_cost(self) -> None:
        f = tile_factors(TerrainType.OPEN, RoadCondition.OBSTRUCTED)
        assert edge_time_cost(500.0, f) == pytest.approx(500.0 / 0.15)  # passable, not sentinel

    def test_impassable_factor_returns_sentinel(self) -> None:
        # The sentinel path still covers a genuinely impassable (zero-speed) factor.
        assert edge_time_cost(500.0, TileFactors(speed_factor=0.0, fuel_factor=1.0)) == BLOCKED_COST


class TestSafeCost:
    def test_threat_inflates_cost(self) -> None:
        assert safe_edge_cost(100.0, 0) == pytest.approx(100.0)
        assert safe_edge_cost(100.0, 3) == pytest.approx(100.0 * (1 + THREAT_WEIGHT * 3))

    def test_blocked_stays_blocked(self) -> None:
        assert safe_edge_cost(BLOCKED_COST, 5) == BLOCKED_COST
