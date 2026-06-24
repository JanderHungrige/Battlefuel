---
id: 93-event-arrival-scheduler
title: Event Arrival Scheduler
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: planned
depends_on: [92-combat-event-catalog-provider]
relates: [49-located-event-model, 52-chatter-mgrs-tagging]
source_files:
  - backend/app/config.py
  - backend/app/providers/combat_events.py
routes: []
models: []
test_files:
  - backend/tests/test_combat_event_catalog_feed.py
data_flow: backend
last_synced: 2026-06-15
status: planned
phase: all
mdd_version: 11
tags: [combat-events, scheduler, websocket, provider-factory]
path: Events/CombatEvents
---

# 93 — Event Arrival Scheduler

## Purpose

Turn the CSV catalog into scheduled, located `combat_event` frames that the existing sim loop can
emit through the current WebSocket path.

## Architecture

Adds a new `combat_event_feed_provider` option: `catalog`.

`CatalogCombatEventFeedProvider` consumes `build_combat_event_catalog_provider(settings)`, assigns
each catalog row a deterministic theater location and sender, and spaces events by
`combat_event_mean_interval_game_s`. It returns the same `CombatEvent` sequence as the existing
`scripted` provider, so `SimEngine.apply_combat_feed()` and `/api/v1/ws` snapshots need no rewrite.

## Business Rules

- Default interval is 900 game-seconds, equivalent to 15 real seconds with the current
  `sim_time_scale=60`.
- Event generation is deterministic from `combat_event_seed` and catalog id.
- First catalog event arrives after one interval, not at sim start.
- `catalog_id` and `supply_relevant` are copied onto generated `CombatEvent`s.
- The provider is opt-in for now (`combat_event_feed_provider=catalog`) so Wave-3 demos can keep
  using the small scripted set until the frontend expansion work lands.

## Verification

Backend tests cover factory selection, interval spacing, deterministic locations, additive catalog
fields, and due-event behavior through the existing `due_combat_events()` helper.
