---
id: 100-unified-threat-chatter
title: Unified Threat & Chatter (single system)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: in_progress
depends_on: [92-combat-event-catalog-provider, 20-event-engine, 23-ops-chatter-sectors]
relates: [94-expandable-chatter-detail, 95-chatter-filters-highlights, 97-chatter-driven-enemy-sightings]
source_files:
  - backend/app/services/event_engine.py
  - backend/app/domain/tile.py
  - backend/app/services/sim_runner.py
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/map/MapView.tsx
routes: []
models: [Tile, TileEvent]
test_files:
  - backend/tests/test_event_engine.py
  - frontend/src/hooks/simSocket.test.ts
data_flow: mixed
last_synced: 2026-06-24
status: in_progress
phase: all
mdd_version: 11
tags: [threat, chatter, event-engine, catalog, tiles, unify]
path: Events/Unified
---

# 100 — Unified Threat & Chatter (single system)

## Why

Wave 4 was meant to *overhaul* the original threat system (Channel A: the `event_engine` mutating
tiles + the "Sector: …" chatter, whose scripted messages were stale) with the richer
`combat_zone_events.csv` catalog. It instead shipped as a **second, parallel** system (Channel B:
the `combat_event` feed → coloured MGRS squares + a separate radio-chatter stream). This unifies
them into one and deletes Channel B.

## What the single system does

- **EventEngine fires from the catalog.** Each tick may fire one located catalog event: it mutates a
  frontline-weighted tile (threat + road), **persists the event on the tile** (`Tile.last_event`
  JSONB — headline/category/sender/supply_relevant/at_game_s), and for sightings spawns an enemy
  unit. Interval ≈ 15 real-s. Every event has a finite duration and **reverts** — restoring the
  tile, clearing `last_event`, removing the enemy — so threats and their enemy units disappear.
- **One chatter feed.** `tile_update` carries `last_event`; the frontend logs a single expandable
  `"<MGRS> — <headline>"` line per located event (reverts/decays update the map silently). The
  kept filter (mode + threshold, default ≥3) and the F5 "Ask advisor" action ride on it.
- **One threat render.** Ambient graded-red MGRS-cell shading only. The located-event detail shows
  in the **MGRS-cell panel** (click) and an optional **map-cell hover** popup (the "Cell hover
  details" checkbox, default off → grid number only).

## Removed (Channel B)

`providers/combat_events.py` (the feed), `domain/combat_event.py`, the on-connect combat snapshot,
`combat_event_feed_provider` config, the frontend combat-event map layers + `combatEventsToGeoJSON`
+ `parse/applyCombatEvent` + `eventIcons` + the `CombatEvent` type + `highlightEventId`. **Kept:**
`combat_event_catalog.py` (now feeds the EventEngine and the F7 obstacle picker) and
`GET /combat-events/catalog`.

## Verification

Backend: `test_event_engine.py` (catalog fire, `last_event`, revert clears event + drops enemy,
decay) — ruff + mypy clean. Frontend: tile-event chatter, filter, cell aggregation, enemy
add/remove reducers — tsc + eslint + vitest + build clean. Live (`make dev`): one expandable chatter
stream ~every 15 s, filter default ≥3, cell panel + hover detail, threats and enemy units fade, no
combat squares or second feed. Migration **0017** adds `tiles.last_event` (run on deploy).
