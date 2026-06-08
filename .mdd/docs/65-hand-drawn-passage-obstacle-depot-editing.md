---
id: 65-hand-drawn-passage-obstacle-depot-editing
title: Map Editing — Add Depot + Remove Obstacle (hand-drawn passage descoped)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-10
wave_status: active
depends_on: [63-routing-mode-multi-route-ui, 24-fuel-supply-model, 19-manual-obstacles]
relates: [29-of8-supply-ui]
source_files:
  - backend/app/providers/supply.py
  - backend/app/api/supply.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/depots
models:
  - fuel_depots
test_files:
  - backend/tests/test_supply_api.py
data_flow: reads-existing
last_synced: 2026-06-04
status: complete
phase: all
mdd_version: 11
tags: [supply, depots, obstacles, map-editing, of8]
path: Map/Editing
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "Hand-drawn passage (injecting operator-drawn routable edges into the pgRouting `ways` graph) was DESCOPED from Wave 10 by the requester (2026-06-04). Logged in TODO.md for a future routing-data wave — it needs live-graph work (the test DB has no `ways`)."
  - "A newly placed depot has no fuel stock yet; it persists and lists, but the OF-8 overview/depot-overlay may only surface depots once stock is added (existing buy/refuel flow)."
---

# 65 — Map Editing: Add Depot + Remove Obstacle

## Purpose

The operator-editing slice of Wave 10: manually place fuel depots on the map and remove
manually-added obstacles. (The third originally-planned part — drawing a passage the router can
use — was descoped by the requester; see Known Issues.)

## Architecture

- **Add fuel depot (new):** `SupplyProvider.create_depot(name, lat, lon)` persists a `fuel_depots`
  row (uuid id, H3 from lat/lon); `POST /api/v1/depots` (201) exposes it. Frontend: an **"Add
  depot"** toggle in the OF-8 (depot-overlay) view; a map click in depot mode calls
  `api.createDepot` then refetches supply. MapView routes the click via a `depotMode` branch +
  `onPlaceDepot`. Esc exits the mode.
- **Remove manual obstacle (pre-existing, Wave 4):** `DELETE /api/v1/obstacles/{id}` + the
  obstacle-mode click-to-remove already shipped in Wave 4 (`19-manual-obstacles`); verified, no
  new work.

## API

`POST /api/v1/depots` — body `{name, lat, lon}` → `FuelDepot` (201). Obstacle add/remove unchanged.

## Business Rules

1. A depot is placed at the exact clicked coordinate; its H3 cell is derived for tile association.
2. Depot placement is an OF-8 action (gated to the depot-overlay role view).
3. Esc cancels depot mode (consistent with the other map modes, F4).

## Data Flow

depot-mode map click → `onPlaceDepot` → `api.createDepot` → `POST /depots` →
`SupplyProvider.create_depot` → `fuel_depots` row → `supply.refetch()` → depot list/overlay.

## Dependencies

- **24-fuel-supply-model** — the depot model/provider extended with `create_depot`.
- **19-manual-obstacles** — the existing obstacle add/remove reused for "remove manual obstacles".
- **63-routing-mode-multi-route-ui** — the map-mode + Esc pattern reused for depot placement.

## Security

Server-authoritative; typed `{name, lat, lon}` to an existing validated route. No new auth surface.

## Known Issues

See frontmatter — hand-drawn passage descoped to TODO.md; new depots need stock before the
OF-8 overview surfaces them.

## Bugs

(none yet)
