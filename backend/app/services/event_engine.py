"""Catalog-driven real-time event engine (v2 unify-threat-chatter).

The single threat/chatter system. Each sim tick may fire one located event drawn from the
``combat_zone_events.csv`` catalog: it mutates a frontline-weighted tile (threat + road), stamps
the tile with the located event (``last_event``) — which drives the unified chatter, the MGRS-cell
panel, and the map hover — and, for enemy-sighting events, spawns a hostile unit. Every fired event
has a finite duration and then **reverts**: the tile's prior state is restored, ``last_event`` is
cleared, and any spawned enemy unit is removed, so threats (and their enemy units) disappear. Light
ambient threats also decay probabilistically. The RNG, clock, and catalog are injected, so a seeded
engine is fully deterministic under test.

This replaces the old generic ``EVENT_CATALOG`` of hard-coded tile mutations and the separate
``combat_event`` feed (Channel B), which has been removed.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from random import Random

from sqlalchemy.ext.asyncio import AsyncSession

from app.api.ws import ConnectionManager
from app.domain.enemy_unit import EnemyUnit, enemy_unit_frame, enemy_unit_removed_frame
from app.domain.frontline import threat_weight
from app.domain.tile import RoadCondition, Tile, TileEvent, TileMutation
from app.providers.combat_event_catalog import CombatEventCatalogItem
from app.providers.enemy_units import (
    is_enemy_sighting,
    map_enemy_sighting,
    register_dynamic_enemy_sighting,
    remove_dynamic_enemy_sighting,
)
from app.providers.tiles import TileDataProvider
from app.services.tile_mutation import apply_tile_mutation, tile_update_frame

# Radio sender per catalog category (the chatter's "from" line).
_SENDER_BY_CATEGORY: dict[str, str] = {
    "Intelligence & Information": "INTEL (J2 FUSION)",
    "Threat Events": "RECON 2-7 (1-4 CAV)",
    "Movement & Access": "ENGINEER NET (54th BEB)",
    "Engagements & Fires": "FIRES (1-9 FA)",
    "Adversary Activity": "DRONE FEED (RQ-7 SHADOW)",
    "Refueling & Fuel": "JLSG FUEL CELL",
    "Supply Chain & Rearming": "SUSTAINMENT (BSB SPO)",
    "Logistics & Support": "SUSTAINMENT (BSB SPO)",
}
_DEFAULT_SENDER = "HQ (3 ID TOC)"

# Word-boundary mine/IED match (so "ident**ified**" doesn't trip it).
_BLOCK_RE = re.compile(r"\b(ied|mine\w*)\b")


_DAMAGE_KEYS = ("chokepoint", "bottleneck", "damaged", "degraded", "severed", "bridge")


def road_for_event(event: str) -> RoadCondition | None:
    """Road impact from the event text: mines/destruction block, damage degrades, else none."""
    e = event.lower()
    if _BLOCK_RE.search(e) or "destroyed" in e:
        return RoadCondition.BLOCKED
    if any(k in e for k in _DAMAGE_KEYS):
        return RoadCondition.DAMAGED
    return None


@dataclass(frozen=True)
class FiredEvent:
    """A catalog event that fired this tick: the tile mutation + an optional enemy to spawn."""

    h3_index: str
    mutation: TileMutation
    enemy: EnemyUnit | None


@dataclass
class _Revert:
    at_game_s: float
    h3_index: str
    mutation: TileMutation
    enemy_id: str | None  # remove this enemy unit when the event reverts


class EventEngine:
    """Fires catalog events, schedules reverts, decays light threats. Pure + injectable."""

    def __init__(
        self,
        rng: Random,
        *,
        catalog: Sequence[CombatEventCatalogItem],
        mean_interval_game_s: float,
        enabled: bool,
        revert_game_s: float = 3600.0,
        decay_interval_game_s: float = 600.0,
        decay_chance: float = 0.2,
        light_threat_max: int = 2,
    ) -> None:
        self._rng = rng
        self._catalog = list(catalog)
        self._mean_interval = mean_interval_game_s
        self._enabled = enabled
        self._revert_game_s = revert_game_s
        self._pending: list[_Revert] = []
        self._decay_interval = decay_interval_game_s
        self._decay_chance = decay_chance
        self._light_threat_max = light_threat_max
        self._next_decay_s = decay_interval_game_s  # first decay pass one interval in

    def collect_due_reverts(self, now_s: float) -> list[tuple[str, TileMutation, str | None]]:
        """Pop reverts whose time has come: (h3, restore-mutation, enemy-id-to-remove)."""
        due = [(r.h3_index, r.mutation, r.enemy_id) for r in self._pending if r.at_game_s <= now_s]
        self._pending = [r for r in self._pending if r.at_game_s > now_s]
        return due

    def decay_due(self, tiles: Sequence[Tile], now_s: float) -> list[tuple[str, TileMutation]]:
        """When a decay interval elapses, step *some* light-threat tiles (1..max) down by one.

        Probabilistic per tile (``decay_chance``), not a synchronized purge: light threats fade
        gradually while the contested east stays populated (replenished by ``maybe_fire``). Heavier
        threats (3+) never decay here — they end via their event's revert. A tile decaying to 0 also
        clears its ``last_event`` so the cell reads benign again (v2 Wave 14 + unify).
        """
        if not self._enabled or now_s < self._next_decay_s:
            return []
        self._next_decay_s = now_s + self._decay_interval
        out: list[tuple[str, TileMutation]] = []
        for t in tiles:
            if not (0 < t.threat_level <= self._light_threat_max):
                continue
            if self._rng.random() < self._decay_chance:
                stepped = t.threat_level - 1
                out.append(
                    (t.h3_index, TileMutation(threat_level=stepped, clear_last_event=stepped == 0))
                )
        return out

    def maybe_fire(
        self, tiles: Sequence[Tile], now_s: float, dt_game_s: float
    ) -> FiredEvent | None:
        """Roll for a catalog event; if it fires, mutate a tile, stamp ``last_event``, schedule its
        revert, and (for sightings) build the enemy unit to spawn."""
        if not self._enabled or not tiles or not self._catalog:
            return None
        if self._rng.random() >= min(1.0, dt_game_s / self._mean_interval):
            return None
        # Weight the spawn toward the frontline + the OPFOR east (v2 Wave 14).
        pool = list(tiles)
        weights = [threat_weight(t.center_lat, t.center_lon) for t in pool]
        tile = self._rng.choices(pool, weights=weights, k=1)[0]
        item = self._rng.choice(self._catalog)

        sender = _SENDER_BY_CATEGORY.get(item.category, _DEFAULT_SENDER)
        last_event = TileEvent(
            headline=item.event,
            category=item.category,
            sender=sender,
            supply_relevant=item.supply_relevant,
            at_game_s=round(now_s, 1),
        )
        mutation = TileMutation(
            threat_level=item.threat_level,
            road_condition=road_for_event(item.event),
            last_event=last_event,
        )
        enemy: EnemyUnit | None = None
        if is_enemy_sighting(item.category, item.event):
            name, sidc, echelon = map_enemy_sighting(item.category, item.event)
            enemy = EnemyUnit(
                id=f"sight-{tile.h3_index}",
                name=name,
                sidc=sidc,
                lat=tile.center_lat,
                lon=tile.center_lon,
                echelon=echelon,
            )
        # Schedule the revert: restore prior threat/road, clear the event, drop the enemy.
        self._pending.append(
            _Revert(
                now_s + self._revert_game_s,
                tile.h3_index,
                TileMutation(
                    threat_level=tile.threat_level,
                    road_condition=tile.road_condition,
                    clear_last_event=True,
                ),
                enemy.id if enemy is not None else None,
            )
        )
        return FiredEvent(tile.h3_index, mutation, enemy)

    async def step(
        self,
        session: AsyncSession,
        tiles: TileDataProvider,
        manager: ConnectionManager,
        now_s: float,
        dt_game_s: float,
    ) -> int:
        """Apply due reverts + decay + any new event, broadcasting each. Returns the count."""
        applied = 0
        for h3_index, mutation, enemy_id in self.collect_due_reverts(now_s):
            tile = await apply_tile_mutation(session, tiles, h3_index, mutation)
            if tile is not None:
                await manager.broadcast(tile_update_frame(tile))
                applied += 1
            if enemy_id is not None and remove_dynamic_enemy_sighting(enemy_id):
                await manager.broadcast(enemy_unit_removed_frame(enemy_id))
        all_tiles = await tiles.list_tiles(session)
        for h3_index, mutation in self.decay_due(all_tiles, now_s):
            tile = await apply_tile_mutation(session, tiles, h3_index, mutation)
            if tile is not None:
                await manager.broadcast(tile_update_frame(tile))
                applied += 1
        fired = self.maybe_fire(all_tiles, now_s, dt_game_s)
        if fired is not None:
            tile = await apply_tile_mutation(session, tiles, fired.h3_index, fired.mutation)
            if tile is not None:
                await manager.broadcast(tile_update_frame(tile))
                applied += 1
                if fired.enemy is not None:
                    register_dynamic_enemy_sighting(
                        fired.enemy.id,
                        fired.enemy.name,
                        fired.enemy.sidc,
                        fired.enemy.lat,
                        fired.enemy.lon,
                        fired.enemy.echelon,
                    )
                    await manager.broadcast(enemy_unit_frame(fired.enemy))
        return applied
