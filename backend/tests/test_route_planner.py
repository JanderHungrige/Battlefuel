"""Tests for terrain-aware duration/fuel estimates (Wave 4 tile-cost-model on the planner)."""

from __future__ import annotations

import pytest

from app.domain.route import RouteMetric, RouteOption, RoutePath
from app.services.route_planner import build_option

_GEOM = [[11.80, 49.20], [11.80, 49.22]]


def _path(*, distance_m: float, effective_distance_m: float, fuel_distance_m: float) -> RoutePath:
    return RoutePath(
        metric=RouteMetric.FAST,
        geometry=_GEOM,
        distance_m=distance_m,
        effective_distance_m=effective_distance_m,
        fuel_distance_m=fuel_distance_m,
        threat_max=0,
        threat_avg=0.0,
    )


def _opt(path: RoutePath, *, consumption: float = 60.0, fuel: float = 1000.0) -> RouteOption:
    return build_option(
        path,
        label="fastest",
        speed_road_kph=60.0,
        consumption_normal_lph=consumption,
        start_fuel_l=fuel,
    )


class TestBuildOption:
    def test_duration_uses_effective_distance(self) -> None:
        # 10 km real, but 20 km effective (slow terrain) at 60 kph → 20 min, not 10.
        opt = _opt(_path(distance_m=10_000, effective_distance_m=20_000, fuel_distance_m=20_000))
        assert opt.duration_s == pytest.approx(20 * 60, rel=1e-3)
        assert opt.distance_m == pytest.approx(10_000)  # display distance stays real

    def test_fuel_uses_fuel_distance(self) -> None:
        # fuel_distance 30 km, 60 lph at 60 kph → 30 min of burn = 30 L.
        opt = _opt(_path(distance_m=10_000, effective_distance_m=20_000, fuel_distance_m=30_000))
        assert opt.fuel_consumed_l == pytest.approx(30.0, rel=1e-3)
        assert opt.fuel_remaining_l == pytest.approx(970.0, rel=1e-3)
        assert opt.sufficient_fuel is True

    def test_falls_back_to_real_distance_when_sums_absent(self) -> None:
        # Pre-annotation path (sums == 0) behaves like the old distance-based estimate.
        opt = _opt(_path(distance_m=12_000, effective_distance_m=0.0, fuel_distance_m=0.0))
        assert opt.duration_s == pytest.approx(12 * 60, rel=1e-3)

    def test_insufficient_fuel_flagged(self) -> None:
        path = _path(distance_m=100_000, effective_distance_m=100_000, fuel_distance_m=100_000)
        opt = _opt(path, consumption=600.0, fuel=100.0)
        assert opt.sufficient_fuel is False
        assert opt.fuel_remaining_l == 0.0
