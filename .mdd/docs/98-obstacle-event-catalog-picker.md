---
id: 98-obstacle-event-catalog-picker
title: Obstacle Event-Catalog Picker
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: in_progress
depends_on: [92-combat-event-catalog-provider, 22-obstacle-tile-ops-ui]
relates: [94-expandable-chatter-detail]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/lib/obstacleCatalog.ts
  - frontend/src/hooks/useCombatEventCatalog.ts
  - frontend/src/components/ObstacleCatalogPicker.tsx
  - frontend/src/App.tsx
routes: [/api/v1/combat-events/catalog]
models: []
test_files:
  - frontend/src/lib/obstacleCatalog.test.ts
  - frontend/src/components/ObstacleCatalogPicker.test.tsx
data_flow: frontend
last_synced: 2026-06-23
status: in_progress
phase: all
mdd_version: 11
tags: [combat-events, obstacles, catalog, picker, frontend]
path: Events/Obstacles
---

# 98 — Obstacle Event-Catalog Picker

## Purpose

Replace the five hard-coded obstacle-kind buttons with a **searchable** picker backed by the
combat-event catalog (doc 92). The operator searches categories/events, picks a template, and
places it on the map; the chosen catalog item prefills a sensible obstacle kind plus tile
situation/threat/road defaults — still manually overridable by editing the placed cell.

## Architecture

- `api/types.ts` + `api/client.ts` — `CombatEventCatalogItem` type and
  `getCombatEventCatalog()` (GET `/api/v1/combat-events/catalog`, already served by F1).
- `lib/obstacleCatalog.ts` (pure) — `catalogToObstacleTemplate(item)` maps a catalog item to an
  `ObstacleTemplate { kind, label, mutation }`, and `filterCatalog(items, query)` for search.
  No React; unit-testable.
- `hooks/useCombatEventCatalog.ts` — fetches the catalog once (only when obstacle mode is first
  used) and returns the items.
- `components/ObstacleCatalogPicker.tsx` — presentational: a search box + filtered list; selecting
  an item emits the derived template. Replaces `ObstacleKindPicker` in obstacle mode.
- `App.tsx` — holds the selected `ObstacleTemplate`; on map placement it creates the obstacle with
  `template.kind` and applies `template.mutation` to the containing H3 tile (so the prefilled
  situation/threat/road take effect; the existing `tile_update` echo refreshes the map).

## Business Rules

- Mapping (deterministic, mirrors the Wave-3 classify spirit):
  - mine / IED → `minefield`, road `blocked`.
  - chokepoint / bottleneck / road damaged / severed → `roadblock`, road `damaged`/`blocked`.
  - road or bridge destroyed → `crater`, road `blocked`.
  - checkpoint / border / curfew / civilian traffic → `checkpoint` or `barricade`.
  - otherwise → `roadblock` when threat ≥ 4, else `checkpoint`.
  - every template carries `threat_level` = the item's threat and `note` = the event text.
- Search matches category or event text, case-insensitive.
- The picker never auto-places; it only sets the active template. Placement stays a map click.

## Verification

Pure tests cover the catalog → template mapping (each branch + threat fallback) and the search
filter. Component tests cover rendering the list, filtering via the search box, and emitting the
template on select.
