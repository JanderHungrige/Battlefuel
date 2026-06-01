"""Random real-time event engine (Wave 4, event-engine).

Each sim tick may fire a catalog event that mutates a random tile, flowing through the same
``apply_tile_mutation`` + ``tile_update`` path as the scripted feed. Temporary events snapshot
the tile's prior values and auto-revert after their duration; permanent ones persist. The RNG
and clock are injected, so a seeded engine is fully deterministic under test.
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from random import Random

from app.api.ws import ConnectionManager
from app.domain.tile import IntelLevel, RoadCondition, Tile, TileMutation, Weather
from app.providers.tiles import TileDataProvider
from app.services.tile_mutation import apply_tile_mutation, tile_update_frame

_GAME_MIN = 60.0  # game-seconds per game-minute

Build = Callable[[Tile, Random], dict[str, object]]


@dataclass(frozen=True)
class EventSpec:
    """One event type: how it mutates a tile, which fields it touches, and how long it lasts."""

    name: str
    duration_game_s: float  # 0 ⇒ permanent (no auto-revert)
    touched: tuple[str, ...]
    build: Build

    def apply(self, tile: Tile, rng: Random) -> TileMutation:
        return TileMutation(**self.build(tile, rng))

    def revert(self, tile: Tile) -> TileMutation:
        """A mutation restoring the touched fields to ``tile``'s current (pre-event) values."""
        return TileMutation(**{f: getattr(tile, f) for f in self.touched})


def _threat_spike(tile: Tile, rng: Random) -> dict[str, object]:
    return {"threat_level": min(5, tile.threat_level + 2)}


def _combat_area(tile: Tile, rng: Random) -> dict[str, object]:
    return {"threat_level": 4}


def _active_combat(tile: Tile, rng: Random) -> dict[str, object]:
    return {"threat_level": 5, "road_condition": RoadCondition.DAMAGED}


def _road_damage(tile: Tile, rng: Random) -> dict[str, object]:
    return {"road_condition": RoadCondition.DAMAGED}


def _road_blocked(tile: Tile, rng: Random) -> dict[str, object]:
    return {"road_condition": RoadCondition.BLOCKED}


def _weather_shift(tile: Tile, rng: Random) -> dict[str, object]:
    return {"weather": rng.choice([Weather.FOG, Weather.RAIN, Weather.STORM])}


def _intel_report(tile: Tile, rng: Random) -> dict[str, object]:
    return {"intel_level": IntelLevel.HIGH}


def _threat_clears(tile: Tile, rng: Random) -> dict[str, object]:
    return {"threat_level": max(0, tile.threat_level - 1)}


def _drone_activity(tile: Tile, rng: Random) -> dict[str, object]:
    return {"threat_level": min(5, tile.threat_level + 1)}


def _minefield(tile: Tile, rng: Random) -> dict[str, object]:
    return {"road_condition": RoadCondition.BLOCKED}


def _area_secured(tile: Tile, rng: Random) -> dict[str, object]:
    return {"threat_level": 0}


EVENT_CATALOG: tuple[EventSpec, ...] = (
    EventSpec("threat_spike", 10 * _GAME_MIN, ("threat_level",), _threat_spike),
    EventSpec("combat_area", 0.0, ("threat_level",), _combat_area),  # permanent until changed
    EventSpec("active_combat", 10 * _GAME_MIN, ("threat_level", "road_condition"), _active_combat),
    EventSpec("road_damage", 30 * _GAME_MIN, ("road_condition",), _road_damage),
    EventSpec("road_blocked", 15 * _GAME_MIN, ("road_condition",), _road_blocked),
    EventSpec("weather_shift", 20 * _GAME_MIN, ("weather",), _weather_shift),
    EventSpec("intel_report", 0.0, ("intel_level",), _intel_report),
    EventSpec("threat_clears", 0.0, ("threat_level",), _threat_clears),
    EventSpec("drone_activity", 15 * _GAME_MIN, ("threat_level",), _drone_activity),
    EventSpec("minefield", 0.0, ("road_condition",), _minefield),  # permanent until cleared
    EventSpec("area_secured", 0.0, ("threat_level",), _area_secured),  # permanent until changed
)


@dataclass
class _Revert:
    at_game_s: float
    h3_index: str
    mutation: TileMutation


class EventEngine:
    """Fires catalog events and schedules reverts. Decision logic is pure + injectable."""

    def __init__(self, rng: Random, *, mean_interval_game_s: float, enabled: bool) -> None:
        self._rng = rng
        self._mean_interval = mean_interval_game_s
        self._enabled = enabled
        self._pending: list[_Revert] = []

    def collect_due_reverts(self, now_s: float) -> list[tuple[str, TileMutation]]:
        """Pop and return reverts whose time has come (pure list bookkeeping)."""
        due = [(r.h3_index, r.mutation) for r in self._pending if r.at_game_s <= now_s]
        self._pending = [r for r in self._pending if r.at_game_s > now_s]
        return due

    def maybe_fire(
        self, tiles: Sequence[Tile], now_s: float, dt_game_s: float
    ) -> tuple[str, TileMutation] | None:
        """Roll for a new event; if it fires, schedule any revert and return (h3, mutation)."""
        if not self._enabled or not tiles:
            return None
        if self._rng.random() >= min(1.0, dt_game_s / self._mean_interval):
            return None
        tile = self._rng.choice(list(tiles))
        spec = self._rng.choice(list(EVENT_CATALOG))
        if spec.duration_game_s > 0:
            self._pending.append(
                _Revert(now_s + spec.duration_game_s, tile.h3_index, spec.revert(tile))
            )
        return (tile.h3_index, spec.apply(tile, self._rng))

    async def step(
        self,
        session: object,
        tiles: TileDataProvider,
        manager: ConnectionManager,
        now_s: float,
        dt_game_s: float,
    ) -> int:
        """Apply due reverts + any new event against the DB, broadcasting each. Returns count."""
        applied = 0
        for h3_index, mutation in self.collect_due_reverts(now_s):
            tile = await apply_tile_mutation(session, tiles, h3_index, mutation)  # type: ignore[arg-type]
            if tile is not None:
                await manager.broadcast(tile_update_frame(tile))
                applied += 1
        all_tiles = await tiles.list_tiles(session)  # type: ignore[arg-type]
        fired = self.maybe_fire(all_tiles, now_s, dt_game_s)
        if fired is not None:
            tile = await apply_tile_mutation(session, tiles, fired[0], fired[1])  # type: ignore[arg-type]
            if tile is not None:
                await manager.broadcast(tile_update_frame(tile))
                applied += 1
        return applied
