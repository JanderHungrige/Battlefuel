"""Tests for the multi-resolution threat model (v2 Wave 21, threat-grid-code-model).

Pure metric-XY logic — no DB, no projection. Coordinates are plain metres; a "2 km level-2 threat
containing a 500 m level-4 patch" is modelled directly on a metre lattice.
"""

from __future__ import annotations

from app.services.threat_grid import (
    DEFAULT_THREAT_PRECISION_M,
    LocatedThreat,
    base_cells,
    cell_origin,
    footprint_contains,
    threat_at,
)


class TestCellOrigin:
    def test_snaps_down_to_lattice(self) -> None:
        assert cell_origin(1234.0, 1000) == 1000.0
        assert cell_origin(2000.0, 1000) == 2000.0  # on the boundary stays

    def test_negative_snaps_down_not_toward_zero(self) -> None:
        assert cell_origin(-1.0, 1000) == -1000.0


class TestFootprintContains:
    def test_point_inside_its_own_cell(self) -> None:
        t = LocatedThreat(x=750.0, y=750.0, level=3, precision_m=1000)
        assert footprint_contains(t, 750.0, 750.0)  # the threat's own point
        assert footprint_contains(t, 10.0, 990.0)  # elsewhere in the 0..1000 cell

    def test_point_outside_the_cell(self) -> None:
        t = LocatedThreat(x=750.0, y=750.0, level=3, precision_m=1000)
        assert not footprint_contains(t, 1000.0, 750.0)  # next cell east (half-open upper bound)
        assert not footprint_contains(t, 750.0, -1.0)

    def test_smaller_grid_code_covers_less(self) -> None:
        small = LocatedThreat(x=250.0, y=250.0, level=4, precision_m=500)
        assert footprint_contains(small, 499.0, 499.0)
        assert not footprint_contains(small, 600.0, 250.0)  # outside the 0..500 cell


class TestThreatAt:
    def test_no_threats_is_zero(self) -> None:
        assert threat_at(100.0, 100.0, []) == 0

    def test_highest_wins_nesting(self) -> None:
        # A 2 km level-2 threat with a 500 m level-4 patch inside it (both anchored near origin).
        broad = LocatedThreat(x=100.0, y=100.0, level=2, precision_m=2000)
        patch = LocatedThreat(x=100.0, y=100.0, level=4, precision_m=500)
        # Inside the 500 m patch → level 4.
        assert threat_at(100.0, 100.0, [broad, patch]) == 4
        # In the 2 km area but OUTSIDE the 0..500 patch → level 2.
        assert threat_at(1500.0, 1500.0, [broad, patch]) == 2
        # Outside the 2 km footprint entirely → 0.
        assert threat_at(2500.0, 2500.0, [broad, patch]) == 0

    def test_order_independent(self) -> None:
        broad = LocatedThreat(x=100.0, y=100.0, level=2, precision_m=2000)
        patch = LocatedThreat(x=100.0, y=100.0, level=4, precision_m=500)
        assert threat_at(100.0, 100.0, [patch, broad]) == 4

    def test_decoupled_from_any_displayed_grid(self) -> None:
        # A 500 m threat colours only its own 500 m cell — a point one 500 m cell away is clear
        # even though both sit inside the same notional 1 km display cell.
        t = LocatedThreat(x=100.0, y=100.0, level=5, precision_m=500)
        assert threat_at(100.0, 100.0, [t]) == 5
        assert threat_at(700.0, 100.0, [t]) == 0


class TestBaseCells:
    def test_default_precision_one_cell(self) -> None:
        t = LocatedThreat(x=100.0, y=100.0, level=3)  # default 1000 m grid code
        assert t.precision_m == DEFAULT_THREAT_PRECISION_M
        field = base_cells([t], base_m=500)
        # 1 km footprint over a 500 m base = 2x2 = 4 base cells, all level 3.
        assert set(field.values()) == {3}
        assert len(field) == 4

    def test_max_per_base_cell(self) -> None:
        broad = LocatedThreat(x=100.0, y=100.0, level=2, precision_m=2000)
        patch = LocatedThreat(x=100.0, y=100.0, level=4, precision_m=500)
        field = base_cells([broad, patch], base_m=500)
        # The 500 m patch base cell (origin) is level 4; surrounding 2 km cells are level 2.
        assert field[(0, 0)] == 4
        assert field[(3, 3)] == 2  # a far corner of the 2 km footprint
