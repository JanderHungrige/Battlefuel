"""Tests for the random event engine (Wave 4 event-engine). Pure, deterministic (seeded RNG)."""

from __future__ import annotations

from random import Random

from app.domain.tile import (
    Cover,
    IntelLevel,
    RoadCondition,
    TerrainType,
    Tile,
    Weather,
)
from app.services.event_engine import EVENT_CATALOG, EventEngine


def _tile(threat: int = 2, road: RoadCondition = RoadCondition.CLEAR) -> Tile:
    return Tile(
        h3_index="8811aa",
        resolution=8,
        center_lat=49.2,
        center_lon=11.85,
        terrain=TerrainType.OPEN,
        threat_level=threat,
        intel_level=IntelLevel.LOW,
        weather=Weather.CLEAR,
        road_condition=road,
        cover=Cover.NONE,
        boundary=[],
    )


def _spec(name: str):  # type: ignore[no-untyped-def]
    return next(s for s in EVENT_CATALOG if s.name == name)


class TestCatalog:
    def test_includes_all_requested_events(self) -> None:
        names = {s.name for s in EVENT_CATALOG}
        assert {
            "threat_spike",
            "combat_area",
            "active_combat",
            "road_damage",
            "road_blocked",
            "weather_shift",
            "intel_report",
            "threat_clears",
            "drone_activity",
            "minefield",
            "area_secured",
        } <= names

    def test_combat_area_and_secured_are_permanent(self) -> None:
        assert _spec("combat_area").duration_game_s == 0.0
        assert _spec("area_secured").duration_game_s == 0.0
        assert _spec("minefield").duration_game_s == 0.0
        assert _spec("active_combat").duration_game_s > 0.0  # temporary


class TestEventSpecs:
    def test_threat_spike_caps_at_five(self) -> None:
        assert _spec("threat_spike").apply(_tile(threat=4), Random(0)).threat_level == 5

    def test_combat_area_sets_four(self) -> None:
        assert _spec("combat_area").apply(_tile(threat=1), Random(0)).threat_level == 4

    def test_active_combat_sets_threat_and_damages_road(self) -> None:
        mut = _spec("active_combat").apply(_tile(), Random(0))
        assert mut.threat_level == 5
        assert mut.road_condition is RoadCondition.DAMAGED

    def test_area_secured_zeroes_threat(self) -> None:
        assert _spec("area_secured").apply(_tile(threat=5), Random(0)).threat_level == 0

    def test_minefield_blocks_road(self) -> None:
        assert _spec("minefield").apply(_tile(), Random(0)).road_condition is RoadCondition.BLOCKED

    def test_drone_activity_bumps_threat_by_one(self) -> None:
        assert _spec("drone_activity").apply(_tile(threat=2), Random(0)).threat_level == 3

    def test_revert_restores_pre_event_values(self) -> None:
        tile = _tile(threat=3, road=RoadCondition.CLEAR)
        revert = _spec("active_combat").revert(tile)
        assert revert.threat_level == 3
        assert revert.road_condition is RoadCondition.CLEAR


class TestMaybeFire:
    def test_disabled_never_fires(self) -> None:
        eng = EventEngine(Random(0), mean_interval_game_s=60.0, enabled=False)
        assert eng.maybe_fire([_tile()], now_s=0.0, dt_game_s=600.0) is None

    def test_no_tiles_never_fires(self) -> None:
        eng = EventEngine(Random(0), mean_interval_game_s=60.0, enabled=True)
        assert eng.maybe_fire([], now_s=0.0, dt_game_s=600.0) is None

    def test_zero_dt_never_fires(self) -> None:
        eng = EventEngine(Random(0), mean_interval_game_s=60.0, enabled=True)
        assert eng.maybe_fire([_tile()], now_s=0.0, dt_game_s=0.0) is None

    def test_fires_when_probability_is_one(self) -> None:
        eng = EventEngine(Random(0), mean_interval_game_s=60.0, enabled=True)
        fired = eng.maybe_fire([_tile()], now_s=0.0, dt_game_s=60.0)  # prob = 1.0
        assert fired is not None
        h3_index, mutation = fired
        assert h3_index == "8811aa"
        assert mutation.changes()  # at least one attribute changed

    def test_temporary_reverts_are_time_gated_and_target_the_tile(self) -> None:
        eng = EventEngine(Random(0), mean_interval_game_s=60.0, enabled=True)
        eng.maybe_fire([_tile()], now_s=0.0, dt_game_s=60.0)
        assert eng.collect_due_reverts(0.0) == []  # nothing due immediately
        later = eng.collect_due_reverts(1e9)  # 0 (permanent) or 1 (temporary) — both valid
        assert all(h == "8811aa" for h, _ in later)
        assert eng.collect_due_reverts(1e9) == []  # drained
