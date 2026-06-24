"""Tests for the catalog-driven event engine (unify-threat-chatter). Pure, deterministic."""

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
from app.providers.combat_event_catalog import CombatEventCatalogItem
from app.services.event_engine import EventEngine, road_for_event


def _tile_at(idx: int, lat: float, lon: float, threat: int = 2) -> Tile:
    return Tile(
        h3_index=f"88{idx:04x}",
        resolution=8,
        center_lat=lat,
        center_lon=lon,
        terrain=TerrainType.OPEN,
        threat_level=threat,
        intel_level=IntelLevel.LOW,
        weather=Weather.CLEAR,
        road_condition=RoadCondition.CLEAR,
        cover=Cover.NONE,
        boundary=[],
    )


def _tile(threat: int = 2, road: RoadCondition = RoadCondition.CLEAR) -> Tile:
    return _tile_at(0x11AA, 49.2, 11.85, threat).model_copy(
        update={"h3_index": "8811aa", "road_condition": road}
    )


def _item(category: str, event: str, threat: int, supply: bool = False) -> CombatEventCatalogItem:
    return CombatEventCatalogItem(
        id=f"x-{event}", category=category, event=event, threat_level=threat, supply_relevant=supply
    )


_SIGHTING = _item("Threat Events", "Hostile unit spotted / identified", 4)
_MINE = _item("Movement & Access", "Minefield confirmed on MSR", 5)
_HUMINT = _item("Intelligence & Information", "New HUMINT report received", 2, supply=False)


def _engine(
    catalog: list[CombatEventCatalogItem],
    *,
    mean: float = 60.0,
    enabled: bool = True,
    revert: float = 1000.0,
) -> EventEngine:
    return EventEngine(
        Random(0),
        catalog=catalog,
        mean_interval_game_s=mean,
        enabled=enabled,
        revert_game_s=revert,
    )


class TestRoadForEvent:
    def test_mines_and_destruction_block(self) -> None:
        assert road_for_event("Minefield confirmed on MSR") is RoadCondition.BLOCKED
        assert road_for_event("IED / mine detected") is RoadCondition.BLOCKED
        assert road_for_event("Road / bridge destroyed") is RoadCondition.BLOCKED

    def test_chokepoint_and_damage_degrade(self) -> None:
        assert road_for_event("Chokepoint / bottleneck identified") is RoadCondition.DAMAGED
        assert road_for_event("Road surface degraded (mud)") is RoadCondition.DAMAGED

    def test_benign_event_leaves_road_unchanged(self) -> None:
        assert road_for_event("New HUMINT report received") is None
        # word-boundary: "identified" must NOT trip the mine rule
        assert road_for_event("Hostile unit spotted / identified") is None


class TestMaybeFire:
    def test_disabled_no_tiles_no_catalog_never_fires(self) -> None:
        assert _engine([_HUMINT], enabled=False).maybe_fire([_tile()], 0.0, 60.0) is None
        assert _engine([_HUMINT]).maybe_fire([], 0.0, 60.0) is None
        assert _engine([]).maybe_fire([_tile()], 0.0, 60.0) is None
        assert _engine([_HUMINT]).maybe_fire([_tile()], 0.0, 0.0) is None  # zero dt

    def test_fires_and_stamps_tile_with_the_catalog_event(self) -> None:
        eng = _engine([_HUMINT])
        fired = eng.maybe_fire([_tile(threat=0)], now_s=10.0, dt_game_s=60.0)  # prob = 1.0
        assert fired is not None
        assert fired.h3_index == "8811aa"
        assert fired.mutation.threat_level == 2  # = the catalog item's threat
        assert fired.mutation.last_event is not None
        assert fired.mutation.last_event.headline == "New HUMINT report received"
        assert fired.mutation.last_event.category == "Intelligence & Information"
        assert fired.mutation.last_event.sender  # a sender was assigned
        assert fired.enemy is None  # HUMINT is not a sighting

    def test_mine_event_blocks_the_road(self) -> None:
        fired = _engine([_MINE]).maybe_fire([_tile()], 0.0, 60.0)
        assert fired is not None and fired.mutation.road_condition is RoadCondition.BLOCKED

    def test_sighting_event_spawns_an_enemy_at_the_tile(self) -> None:
        fired = _engine([_SIGHTING]).maybe_fire([_tile_at(1, 49.24, 11.86)], 0.0, 60.0)
        assert fired is not None and fired.enemy is not None
        assert fired.enemy.lat == 49.24 and fired.enemy.lon == 11.86
        assert fired.enemy.sidc.startswith("1006")  # hostile affiliation
        assert fired.enemy.id == f"sight-{fired.h3_index}"

    def test_revert_restores_state_clears_event_and_drops_enemy(self) -> None:
        eng = _engine([_SIGHTING], revert=500.0)
        tile = _tile(threat=1, road=RoadCondition.CLEAR)
        fired = eng.maybe_fire([tile], now_s=0.0, dt_game_s=60.0)
        assert fired is not None and fired.enemy is not None
        assert eng.collect_due_reverts(100.0) == []  # not due yet
        due = eng.collect_due_reverts(1000.0)
        assert len(due) == 1
        h3, mutation, enemy_id = due[0]
        assert h3 == "8811aa"
        assert mutation.threat_level == 1  # prior threat restored
        assert mutation.clear_last_event is True
        assert enemy_id == fired.enemy.id
        assert eng.collect_due_reverts(1000.0) == []  # drained


class TestDecay:
    def _engine(self, chance: float = 1.0) -> EventEngine:
        return EventEngine(
            Random(0),
            catalog=[_HUMINT],
            mean_interval_game_s=1e12,  # spawning off → isolate decay
            enabled=True,
            decay_interval_game_s=600.0,
            decay_chance=chance,
            light_threat_max=2,
        )

    def test_no_decay_before_interval(self) -> None:
        tiles = [_tile_at(i, 49.2, 11.86, threat=2) for i in range(10)]
        assert self._engine().decay_due(tiles, now_s=599.0) == []

    def test_light_threats_step_down_and_zero_clears_event(self) -> None:
        ones = [_tile_at(i, 49.2, 11.86, threat=1) for i in range(8)]
        due = self._engine(chance=1.0).decay_due(ones, now_s=600.0)
        assert len(due) == 8
        for _h3, mutation in due:
            assert mutation.threat_level == 0
            assert mutation.clear_last_event is True  # decayed to 0 → wipe the event

    def test_heavy_threats_never_decay(self) -> None:
        heavy = [_tile_at(i, 49.2, 11.86, threat=4) for i in range(10)]
        assert self._engine(chance=1.0).decay_due(heavy, now_s=600.0) == []


class TestFrontlineWeightedSpawn:
    def _run(self, n: int) -> list[Tile]:
        tiles = [_tile_at(i, 49.22, 11.79 + 0.005 * i) for i in range(28)]
        by_h3 = {t.h3_index: t for t in tiles}
        eng = EventEngine(Random(7), catalog=[_HUMINT], mean_interval_game_s=1.0, enabled=True)
        out = []
        for _ in range(n):
            fired = eng.maybe_fire(tiles, now_s=0.0, dt_game_s=1000.0)  # prob = 1.0
            assert fired is not None
            out.append(by_h3[fired.h3_index])
        return out

    def test_majority_of_spawns_land_in_or_east_of_the_front(self) -> None:
        fired = self._run(500)
        east = sum(1 for t in fired if is_east(t.center_lat, t.center_lon))
        assert east / len(fired) > 0.6

    def test_deep_nato_rear_is_rarely_hit(self) -> None:
        fired = self._run(500)
        deep_rear = sum(1 for t in fired if t.center_lon < frontline_lon(t.center_lat) - 0.02)
        assert deep_rear / len(fired) < 0.10
