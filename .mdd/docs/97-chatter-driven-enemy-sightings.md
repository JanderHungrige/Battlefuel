---
id: 97-chatter-driven-enemy-sightings
title: Chatter-Driven Enemy Sightings
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: in_progress
depends_on: [93-event-arrival-scheduler, 53-enemy-red-nato-units]
relates: [49-located-event-model, 52-chatter-mgrs-tagging]
source_files:
  - backend/app/domain/enemy_unit.py
  - backend/app/providers/enemy_units.py
  - backend/app/services/sim_runner.py
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/App.tsx
routes: []
models: [EnemyUnit]
test_files:
  - backend/tests/test_combat_event_catalog_feed.py
  - backend/tests/test_combat_events.py
  - frontend/src/hooks/simSocket.test.ts
data_flow: mixed
last_synced: 2026-06-23
status: in_progress
phase: all
mdd_version: 11
tags: [combat-events, enemy-units, chatter, websocket, app6]
path: Events/EnemySightings
---

# 97 — Chatter-Driven Enemy Sightings

## Purpose

Events that mean "enemy spotted / identified / contact" spawn or update a hostile enemy unit so
the map shows a red APP-6 hostile symbol where the sighting was reported — live, during a sim run,
without a page reload.

## Architecture

Server-authoritative + WebSocket realtime (matching `unit_update` / `tile_update` /
`combat_event`):

- Backend `register_dynamic_enemy_sighting_from_event(ev)` now **returns** the registered
  `EnemyUnit` (or `None` when the event is not a sighting). The sim loop
  (`apply_combat_feed`) broadcasts an `enemy_unit` frame for each produced sighting.
- `domain/enemy_unit.py` gains `enemy_unit_frame(unit)` — the additive `enemy_unit` WS frame.
- Dedup key is the catalog id when present, else the event id, so repeated catalog events update
  the same contact's location/threat instead of piling up duplicates (existing
  `_dynamic_units` dict + `ChatterEnemyUnitProvider`).
- Frontend `simSocket.ts` gains `parseEnemyUnit` / `applyEnemyUnit` (pure). `useSimSocket`
  reduces `enemy_unit` frames into a `enemySightings` map keyed by id.
- `App.tsx` merges the seed `enemyUnits` (initial GET) with the dynamic sightings (dedup by id)
  and passes the union to `MapView`, which already renders enemy units via `syncEnemyUnits`.

## Business Rules

- A combat event is a sighting when `is_enemy_sighting(category, event)` is true (keyword/category
  rule already used by the backend) — the single source of truth; the frontend does not
  re-interpret it.
- The hostile SIDC + echelon come from `map_enemy_sighting` (existing).
- Dedup by `catalog_id` then `id`; an updated sighting moves the existing contact (no duplicate).
- `enemy_unit` is an additive frame; existing consumers are untouched. Malformed frames are
  dropped with a logged warning (frontend pure reducer contract).

## Verification

Backend tests cover the sighting → broadcast path (a sighting event emits one `enemy_unit` frame;
a non-sighting emits none) and dedup/update on repeat. Frontend pure tests cover
`parseEnemyUnit` (valid + rejected frames) and `applyEnemyUnit` (latest-per-id wins).
