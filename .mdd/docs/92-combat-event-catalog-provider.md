---
id: 92-combat-event-catalog-provider
title: Combat Event Catalog Provider
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: planned
depends_on: [49-located-event-model]
relates: [52-chatter-mgrs-tagging, 53-enemy-red-nato-units]
source_files:
  - data/combat_zone_events.csv
  - backend/app/domain/combat_event.py
  - backend/app/providers/combat_events.py
  - backend/app/config.py
routes: []
models: []
test_files:
  - backend/tests/test_combat_events.py
data_flow: backend
last_synced: 2026-06-15
status: planned
phase: all
mdd_version: 11
tags: [combat-events, csv, catalog, provider-factory, chatter]
path: Events/CombatEvents
---

# 92 — Combat Event Catalog Provider

## Purpose

Load the full `data/combat_zone_events.csv` catalog through a typed backend provider so Wave 4 can
generate real event/chatter traffic from data instead of the small Wave-3 scripted event list.

## Architecture

`providers/combat_events.py` owns two seams:

- `CombatEventFeedProvider` — existing located, scheduled events consumed by the sim.
- `CombatEventCatalogProvider` — new CSV-backed catalog rows consumed by the Wave-4 scheduler.

The catalog provider is selected by config (`combat_event_catalog_provider`) and defaults to
`csv_catalog`; tests can select `none`. CSV parsing stays backend-only.

## Data Model

`CombatEventCatalogItem`: `id`, `category`, `event`, `threat_level`, `supply_relevant`.

`CombatEvent` gains additive optional fields for downstream frames: `catalog_id`,
`supply_relevant`, and `detail`. Existing frame fields stay stable.

## Business Rules

- CSV must contain `Category`, `Event`, `Threat Level`, and `Supply Relevant`.
- Threat level is normalized to an integer in `0..5`.
- Supply relevance accepts the current seed values `SUPPLY/NO`, plus `YES/NO`, `TRUE/FALSE`,
  `1/0`, and `Y/N`.
- Malformed rows raise a contextual provider error; they are not silently ignored.
- Catalog ids are stable slugs derived from row number + category + event.

## Verification

Backend tests cover CSV loading, default factory selection, `none` provider, malformed rows, and
additive `combat_event` frame fields.
