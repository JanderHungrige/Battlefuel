"""Tests for the East/West frontline definition + the theater seed layout (v2 Wave 14).

The frontline is the single shared definition of where NATO (west) meets OPFOR (east). These
tests pin down its geometry (irregular — bulges and gaps) and verify the seeded force is laid
out relative to it: NATO combat forward in the west, HQ + fuel trucks + depots in the rear,
OPFOR in the east — all inside the Hohenfels bbox.
"""

from __future__ import annotations

from itertools import pairwise
from random import Random

import pytest

from app.domain.frontline import (
    FRONTLINE_CONTROL,
    REAR_LON_MAX,
    frontline_lon,
    initial_threat_level,
    is_east,
    is_west,
    threat_weight,
)
from app.domain.theater import HOHENFELS
from app.providers.enemy_units import SeededEnemyUnitProvider
from app.services.instance_seed import SEED_PLACEMENTS
from app.services.supply_seed import SEED_DEPOTS

_COMBAT_TYPES = {"armor-tank-coy", "mech-inf-coy", "inf-coy", "recon-troop", "arty-bty"}
_REAR_TYPES = {"hq-bn-main", "fuel-supply-pl"}


class TestFrontlineGeometry:
    def test_interpolates_between_control_points(self) -> None:
        (lat0, lon0), (lat1, lon1) = FRONTLINE_CONTROL[0], FRONTLINE_CONTROL[1]
        mid = (lat0 + lat1) / 2
        assert frontline_lon(mid) == pytest.approx((lon0 + lon1) / 2)

    def test_clamps_beyond_the_ends(self) -> None:
        assert frontline_lon(0.0) == FRONTLINE_CONTROL[0][1]  # far south → first point
        assert frontline_lon(90.0) == FRONTLINE_CONTROL[-1][1]  # far north → last point

    def test_is_west_and_east_are_complementary(self) -> None:
        lat = 49.22
        front = frontline_lon(lat)
        assert is_west(lat, front - 0.01) is True
        assert is_east(lat, front - 0.01) is False
        assert is_east(lat, front + 0.01) is True
        assert is_west(lat, front + 0.01) is False

    def test_frontline_is_irregular_not_a_straight_meridian(self) -> None:
        lons = [lon for _, lon in FRONTLINE_CONTROL]
        # It weaves a meaningful amount east-west (bulges + gaps), not a single longitude.
        assert max(lons) - min(lons) >= 0.01
        # Non-monotonic: the direction reverses at least once (a bulge AND a gap).
        deltas = [b - a for a, b in pairwise(lons)]
        signs = {d > 0 for d in deltas}
        assert signs == {True, False}, "frontline should bulge east and dent west"


class TestNatoLayout:
    def test_every_nato_unit_is_west_of_the_front(self) -> None:
        for inst_id, _name, _type, lat, lon, _status, _fuel in SEED_PLACEMENTS:
            assert is_west(lat, lon), f"{inst_id} at ({lat},{lon}) is not west of the front"

    def test_at_least_six_forward_combat_units(self) -> None:
        combat = [p for p in SEED_PLACEMENTS if p[2] in _COMBAT_TYPES]
        assert len(combat) >= 6

    def test_hq_and_fuel_trucks_are_in_the_rear(self) -> None:
        rear = [p for p in SEED_PLACEMENTS if p[2] in _REAR_TYPES]
        assert rear, "expected HQ + fuel-supply units"
        for inst_id, _name, _type, _lat, lon, _status, _fuel in rear:
            assert lon <= REAR_LON_MAX, f"{inst_id} (rear) at lon {lon} is forward of REAR_LON_MAX"

    def test_combat_line_sits_forward_of_the_rear_echelon(self) -> None:
        combat_lons = [p[4] for p in SEED_PLACEMENTS if p[2] in _COMBAT_TYPES]
        rear_lons = [p[4] for p in SEED_PLACEMENTS if p[2] in _REAR_TYPES]
        assert min(combat_lons) > max(rear_lons)  # every combat unit is east of every rear unit

    def test_all_nato_units_inside_the_theater_bbox(self) -> None:
        b = HOHENFELS.bbox
        for inst_id, _name, _type, lat, lon, _status, _fuel in SEED_PLACEMENTS:
            assert b.west < lon < b.east and b.south < lat < b.north, f"{inst_id} outside bbox"


class TestOpforLayout:
    def test_every_enemy_unit_is_east_of_the_front(self) -> None:
        for u in SeededEnemyUnitProvider().units():
            assert is_east(u.lat, u.lon), f"{u.id} at ({u.lat},{u.lon}) is not east of the front"

    def test_all_enemy_units_inside_the_theater_bbox(self) -> None:
        b = HOHENFELS.bbox
        for u in SeededEnemyUnitProvider().units():
            assert b.west < u.lon < b.east and b.south < u.lat < b.north, f"{u.id} outside bbox"


class TestThreatWeight:
    def test_always_positive(self) -> None:
        for lat in (49.18, 49.22, 49.27):
            for lon in (11.78, 11.82, 11.85, 11.88, 11.92):
                assert threat_weight(lat, lon) > 0.0

    def test_peaks_on_the_front(self) -> None:
        lat = 49.22
        front = frontline_lon(lat)
        on_front = threat_weight(lat, front)
        assert on_front > threat_weight(lat, front - 0.05)  # > deep west
        assert on_front > threat_weight(lat, front + 0.05)  # > deep east

    def test_east_baseline_exceeds_deep_west(self) -> None:
        lat = 49.22
        front = frontline_lon(lat)
        assert threat_weight(lat, front + 0.05) > threat_weight(lat, front - 0.05)

    def test_falls_off_behind_the_line(self) -> None:
        lat = 49.22
        front = frontline_lon(lat)
        assert threat_weight(lat, front - 0.008) > threat_weight(lat, front - 0.04)


class TestInitialThreat:
    def test_always_in_range(self) -> None:
        rng = Random(0)
        for lat in (49.19, 49.22, 49.26):
            for lon in (11.78, 11.82, 11.85, 11.88, 11.92):
                assert 0 <= initial_threat_level(lat, lon, rng) <= 5

    def test_deep_rear_is_mostly_benign(self) -> None:
        rng = Random(0)
        lat = 49.22
        lon = frontline_lon(lat) - 0.05
        vals = [initial_threat_level(lat, lon, rng) for _ in range(200)]
        assert sum(v == 0 for v in vals) / len(vals) > 0.85
        assert max(vals) <= 1

    def test_east_shoulder_of_the_front_is_hot(self) -> None:
        rng = Random(0)
        lat = 49.22
        lon = frontline_lon(lat) + 0.006
        vals = [initial_threat_level(lat, lon, rng) for _ in range(200)]
        assert min(vals) >= 3 and max(vals) == 5

    def test_deep_east_is_broadly_threatened_but_not_max(self) -> None:
        rng = Random(0)
        lat = 49.22
        lon = frontline_lon(lat) + 0.05
        vals = [initial_threat_level(lat, lon, rng) for _ in range(200)]
        assert all(v >= 1 for v in vals) and max(vals) <= 3

    def test_deterministic_for_a_given_seed(self) -> None:
        a = [initial_threat_level(49.22, 11.86, Random(7)) for _ in range(3)]
        b = [initial_threat_level(49.22, 11.86, Random(7)) for _ in range(3)]
        assert a == b


class TestDepotLayout:
    def test_depots_are_in_the_western_rear(self) -> None:
        for depot_id, _name, lat, lon in SEED_DEPOTS:
            assert is_west(lat, lon), f"{depot_id} is not west of the front"
            assert lon <= REAR_LON_MAX, f"{depot_id} at lon {lon} is forward of REAR_LON_MAX"
