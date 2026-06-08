"""Tests for the random event engine (Wave 4 event-engine). Pure, deterministic (seeded RNG)."""

from __future__ import annotations

from random import Random

from app.domain.frontline import frontline_lon, is_east
from app.domain.tile import (
    Cover,
    IntelLevel,
    RoadCondition,
    TerrainType,
    Tile,
    Weather,
)
from app.services.event_engine import EVENT_CATALOG, EventEngine


def _tile_at(idx: int, lat: float, lon: float) -> Tile:
    return Tile(
        h3_index=f"88{idx:04x}",
        resolution=8,
        center_lat=lat,
        center_lon=lon,
        terrain=TerrainType.OPEN,
        threat_level=2,
        intel_level=IntelLevel.LOW,
        weather=Weather.CLEAR,
        road_condition=RoadCondition.CLEAR,
        cover=Cover.NONE,
        boundary=[],
    )


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


class TestLightThreatDecay:
    """Light threats (1..max) fade probabilistically each interval; heavier ones persist (W14)."""

    def _engine(self, chance: float = 0.5) -> EventEngine:
        # Spawning off (mean_interval huge) so we isolate decay behaviour.
        return EventEngine(
            Random(0),
            mean_interval_game_s=1e12,
            enabled=True,
            decay_interval_game_s=600.0,
            decay_chance=chance,
            light_threat_max=2,
        )

    def _light_tiles(self, n: int, level: int = 2) -> list[Tile]:
        return [
            _tile_at(i, 49.2, 11.86).model_copy(update={"threat_level": level}) for i in range(n)
        ]

    def test_no_decay_before_the_interval(self) -> None:
        eng = self._engine()
        assert eng.decay_due(self._light_tiles(50), now_s=599.0) == []

    def test_some_but_not_all_light_threats_step_down(self) -> None:
        eng = self._engine(chance=0.5)
        due = eng.decay_due(self._light_tiles(200), now_s=600.0)
        assert 0 < len(due) < 200  # probabilistic — a gradual fade, not a purge
        for _h3, mutation in due:
            assert mutation.threat_level == 1  # each decayed tile stepped 2 -> 1

    def test_chance_one_decays_every_light_tile(self) -> None:
        eng = self._engine(chance=1.0)
        assert len(eng.decay_due(self._light_tiles(30), now_s=600.0)) == 30

    def test_heavy_threats_never_decay(self) -> None:
        eng = self._engine(chance=1.0)
        heavy = [
            _tile_at(i, 49.2, 11.86).model_copy(update={"threat_level": 4}) for i in range(50)
        ]
        assert eng.decay_due(heavy, now_s=600.0) == []

    def test_benign_tiles_never_decay(self) -> None:
        eng = self._engine(chance=1.0)
        benign = [
            _tile_at(i, 49.2, 11.86).model_copy(update={"threat_level": 0}) for i in range(50)
        ]
        assert eng.decay_due(benign, now_s=600.0) == []

    def test_decay_is_rate_limited_to_one_pass_per_interval(self) -> None:
        eng = self._engine(chance=1.0)
        tiles = self._light_tiles(10)
        assert eng.decay_due(tiles, now_s=600.0)  # first pass fires
        assert eng.decay_due(tiles, now_s=900.0) == []  # within the next interval → nothing
        assert eng.decay_due(tiles, now_s=1200.0)  # next interval → fires again

    def test_disabled_engine_never_decays(self) -> None:
        eng = EventEngine(Random(0), mean_interval_game_s=1e12, enabled=False)
        assert eng.decay_due(self._light_tiles(10), now_s=1e9) == []


class TestFrontlineWeightedSpawn:
    """Spawns are weighted toward the front + the OPFOR east, not uniform (v2 Wave 14)."""

    def _run(self, n: int) -> list[Tile]:
        # A west→east strip of tiles across the theater at one latitude.
        tiles = [_tile_at(i, 49.22, 11.79 + 0.005 * i) for i in range(28)]
        by_h3 = {t.h3_index: t for t in tiles}
        eng = EventEngine(Random(7), mean_interval_game_s=1.0, enabled=True)
        out = []
        for _ in range(n):
            fired = eng.maybe_fire(tiles, now_s=0.0, dt_game_s=1000.0)  # prob = 1.0 → always fires
            assert fired is not None
            out.append(by_h3[fired[0]])
        return out

    def test_majority_of_spawns_land_in_or_east_of_the_front(self) -> None:
        fired = self._run(500)
        east = sum(1 for t in fired if is_east(t.center_lat, t.center_lon))
        assert east / len(fired) > 0.6

    def test_deep_nato_rear_is_rarely_hit(self) -> None:
        fired = self._run(500)
        deep_rear = sum(
            1 for t in fired if t.center_lon < frontline_lon(t.center_lat) - 0.02
        )
        assert deep_rear / len(fired) < 0.10
