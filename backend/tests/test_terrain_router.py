"""Tests for the off-road terrain router (v2 Wave 1 Feature 2: terrain-router).

Pure A* over the H3 grid — no DB. Tile maps are hand-built from real H3 cells so the
adjacency and hex-center geometry are exact and the assertions are deterministic.
"""

from __future__ import annotations

import h3
import pytest

from app.domain.route import RouteMetric
from app.domain.tile import TerrainType
from app.services.sim import haversine_m
from app.services.terrain_router import terrain_or_direct, terrain_path

_RES = 8  # DEFAULT_RESOLUTION — the theater tile resolution
_CENTER = h3.latlng_to_cell(49.21, 11.84, _RES)
_RING = [c for c in h3.grid_disk(_CENTER, 1) if c != _CENTER]


def _latlng(cell: str) -> tuple[float, float]:
    lat, lon = h3.cell_to_latlng(cell)
    return lat, lon


def _dist_between(a: str, b: str) -> float:
    a_lat, a_lon = _latlng(a)
    b_lat, b_lon = _latlng(b)
    return haversine_m(a_lon, a_lat, b_lon, b_lat)


# A connected blob of real adjacent cells (everything within 2 rings of the center) so A* can
# actually traverse it. Start at the center, end at the farthest cell (2 hops away).
_REGION = list(h3.grid_disk(_CENTER, 2))
_START = _CENTER
_DEST = max(_REGION, key=lambda c: _dist_between(c, _CENTER))


def _region_tiles(terrain: TerrainType = TerrainType.OPEN, threat: int = 0) -> dict[str, tuple]:
    """A connected region of adjacent cells, all the given terrain/threat."""
    return {c: (terrain, threat) for c in _REGION}


class TestTerrainPathBasics:
    def test_returns_oriented_path_start_to_destination(self) -> None:
        tiles = _region_tiles()
        s_lat, s_lon = _latlng(_START)
        d_lat, d_lon = _latlng(_DEST)
        path = terrain_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST)
        assert path is not None
        assert path.metric is RouteMetric.FAST
        assert path.degraded is False
        assert len(path.geometry) >= 2
        assert path.distance_m > 0
        assert path.effective_distance_m > 0
        # geometry is [lon, lat]; first point nearest the start, last nearest the destination
        first, last = path.geometry[0], path.geometry[-1]
        assert haversine_m(first[0], first[1], s_lon, s_lat) < haversine_m(
            last[0], last[1], s_lon, s_lat
        )
        assert haversine_m(last[0], last[1], d_lon, d_lat) < haversine_m(
            first[0], first[1], d_lon, d_lat
        )

    def test_same_cell_has_no_path(self) -> None:
        tiles = _region_tiles()
        lat, lon = _latlng(_START)
        assert terrain_path(tiles, lat, lon, lat, lon, RouteMetric.FAST) is None

    def test_empty_theater_has_no_path(self) -> None:
        assert terrain_path({}, 49.21, 11.84, 49.22, 11.84, RouteMetric.FAST) is None

    def test_slower_terrain_costs_more_time(self) -> None:
        s_lat, s_lon = _latlng(_START)
        d_lat, d_lon = _latlng(_DEST)
        open_path = terrain_path(
            _region_tiles(TerrainType.OPEN), s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST
        )
        forest_path = terrain_path(
            _region_tiles(TerrainType.FOREST), s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST
        )
        assert open_path is not None and forest_path is not None
        # Same real distance, but forest (speed factor 0.8) inflates the terrain time-proxy.
        assert forest_path.distance_m == open_path.distance_m
        assert forest_path.effective_distance_m > open_path.effective_distance_m


class TestSafeMetricAvoidsThreat:
    def test_safe_route_detours_around_high_threat_cell(self) -> None:
        # Center cell is high-threat; the ring around it is benign. Start and destination are
        # opposite ring cells: FAST cuts through the center (2 steps), SAFE detours the ring.
        n1 = _RING[0]
        n1_lat, n1_lon = _latlng(n1)

        def _dist_from_n1(c: str) -> float:
            lat, lon = _latlng(c)
            return haversine_m(lon, lat, n1_lon, n1_lat)

        opposite = max(_RING, key=_dist_from_n1)
        tiles: dict[str, tuple] = {_CENTER: (TerrainType.OPEN, 5)}
        for c in _RING:
            tiles[c] = (TerrainType.OPEN, 0)
        s_lat, s_lon = _latlng(n1)
        d_lat, d_lon = _latlng(opposite)

        fast = terrain_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST)
        safe = terrain_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.SAFE)
        assert fast is not None and safe is not None
        # FAST takes the short path through the high-threat center; SAFE avoids it.
        assert fast.threat_max == 5
        assert safe.threat_max == 0
        # Avoiding the center means a longer real distance.
        assert safe.distance_m > fast.distance_m


class TestDirectPath:
    """F2 (Wave 10, doc 61): the 'direct' mode — a near-straight cross-country line that follows
    terrain cost but does NOT avoid threat or obstacles. RED until direct_path exists."""

    def test_direct_path_returns_straight_start_to_dest(self) -> None:
        from app.services.terrain_router import direct_path

        tiles = _region_tiles()
        s_lat, s_lon = _latlng(_START)
        d_lat, d_lon = _latlng(_DEST)
        path = direct_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST)
        assert path is not None
        assert len(path.geometry) >= 2
        assert path.distance_m > 0
        assert path.effective_distance_m > 0
        assert path.degraded is False

    def test_direct_path_does_not_avoid_threat(self) -> None:
        from app.services.terrain_router import direct_path

        # High-threat center between two opposite ring cells: the straight line crosses it.
        n1 = _RING[0]
        n1_lat, n1_lon = _latlng(n1)

        def _dist_from_n1(c: str) -> float:
            lat, lon = _latlng(c)
            return haversine_m(lon, lat, n1_lon, n1_lat)

        opposite = max(_RING, key=_dist_from_n1)
        tiles: dict[str, tuple] = {_CENTER: (TerrainType.OPEN, 5)}
        for c in _RING:
            tiles[c] = (TerrainType.OPEN, 0)
        s_lat, s_lon = _latlng(n1)
        d_lat, d_lon = _latlng(opposite)
        # Even SAFE 'direct' goes straight through the threat — direct never detours.
        path = direct_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.SAFE)
        assert path is not None
        assert path.threat_max == 5

    def test_direct_path_same_or_empty_is_none(self) -> None:
        from app.services.terrain_router import direct_path

        lat, lon = _latlng(_START)
        assert direct_path(_region_tiles(), lat, lon, lat, lon, RouteMetric.FAST) is None
        assert direct_path({}, 49.21, 11.84, 49.22, 11.84, RouteMetric.FAST) is None


class TestTerrainOrDirect:
    """F3 (Wave 18, doc 107): off-road routing falls back to a straight line when no terrain path
    exists, instead of surfacing 'no route to that destination'."""

    def test_uses_terrain_path_when_one_exists(self) -> None:
        # Connected region → a real A* terrain path, not the fallback (degraded stays False).
        tiles = _region_tiles()
        s_lat, s_lon = _latlng(_START)
        d_lat, d_lon = _latlng(_DEST)
        path = terrain_or_direct(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST)
        assert path is not None
        assert path.degraded is False
        assert len(path.geometry) >= 2

    def test_falls_back_to_straight_line_when_unreachable(self) -> None:
        # Two cells 3 rings apart with nothing between them: A* can't traverse, so we draw a
        # straight line (flagged degraded) rather than returning None.
        far = max(h3.grid_disk(_CENTER, 3), key=lambda c: _dist_between(c, _CENTER))
        tiles: dict[str, tuple] = {_CENTER: (TerrainType.OPEN, 0), far: (TerrainType.OPEN, 0)}
        s_lat, s_lon = _latlng(_CENTER)
        d_lat, d_lon = _latlng(far)
        assert terrain_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST) is None
        path = terrain_or_direct(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST)
        assert path is not None  # no longer "no route"
        assert path.degraded is True  # flagged as the straight-line fallback
        assert path.geometry == [[s_lon, s_lat], [d_lon, d_lat]]

    def test_none_only_when_even_a_line_is_impossible(self) -> None:
        assert terrain_or_direct({}, 49.21, 11.84, 49.22, 11.84, RouteMetric.FAST) is None


class TestOffroadFuelPenalty:
    """F5 (Wave 18, doc 109): off-road movement carries an explicit fuel penalty on top of the
    terrain factor (the speed penalty is the unit's speed_offroad_kph, applied in the planner)."""

    def test_offroad_fuel_distance_includes_the_penalty(self) -> None:
        from app.services.cost_model import OFFROAD_FUEL_PENALTY

        assert OFFROAD_FUEL_PENALTY > 1.0  # it is a penalty
        s_lat, s_lon = _latlng(_START)
        d_lat, d_lon = _latlng(_DEST)
        # OPEN terrain: speed factor 1.0 -> effective == real distance; fuel factor 1.0 x penalty.
        tiles = _region_tiles(TerrainType.OPEN)
        path = terrain_path(tiles, s_lat, s_lon, d_lat, d_lon, RouteMetric.FAST)
        assert path is not None
        expected_fuel = OFFROAD_FUEL_PENALTY * path.effective_distance_m
        assert path.fuel_distance_m == pytest.approx(expected_fuel)
        assert path.fuel_distance_m > path.effective_distance_m  # thirstier than time alone
