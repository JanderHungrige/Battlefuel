---
id: 74-routed-fuel-run
title: Routed Fuel Run (truck → unit)
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-12
wave_status: active
depends_on: []
source_files:
  - backend/app/services/refuel_service.py
  - backend/app/services/fuel_run_service.py
  - backend/app/api/fuel_runs.py
  - backend/app/main.py
  - frontend/src/lib/fuelRun.ts
  - frontend/src/hooks/useFuelRun.ts
  - frontend/src/components/FuelRunPanel.tsx
  - frontend/src/components/SupplyPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/fuel-runs
models: []
test_files:
  - backend/tests/test_fuel_runs.py
  - frontend/src/lib/fuelRun.test.ts
data_flow: writes-existing
last_synced: 2026-06-06
status: complete
phase: all
mdd_version: 11
tags: [of8, fuel-run, refuel, routing, move-order, safe-fast]
path: OF-8/Fuel Run
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "App.test.tsx (full-app shell) can hit the 5s test timeout under parallel load — pre-existing heavy integration test; passes in isolation."
security_read_sites: []
sister_projects: []
---

# 74 — Routed Fuel Run (truck → unit)

## Purpose

Turn the OF-8 refuel into a routed **fuel run**: the engine plans Safe/Fast routes and, on
confirm, dispatches the fuel truck to the unit and transfers fuel on arrival.

## Architecture

Reuses the Wave-10 routing (`POST /routes/plan`, Safe/Fast) + never-stall movement
(`create_move_order`) + the co-location transfer (`try_complete_refuel`). New: an explicit-truck
path on `create_refuel_order` (skip the recommender), and `POST /api/v1/fuel-runs` which creates
+ activates the move order (mover → target) and the refuel order (unit ↔ truck) together
(rolls the move back if the refuel can't be wired). Frontend `useFuelRun` drives two entry
points; `FuelRunPanel` shows the route options + confirm.

## API

`POST /api/v1/fuel-runs` `{ mover_id, unit_id, truck_id, dest_lat, dest_lon, metric, mode? }`
→ `{ move_order, refuel_order }` (both active). 404 unknown mover/unit; 422 unroutable / no
compatible fuel truck.

## Business Rules

- **Truck-first:** click a fuel truck → "Create fuel run" → click the target unit on the map →
  Safe/Fast routes → pick → confirm → truck routes to the unit; transfer fires on co-location.
- **Unit-first:** click a unit (OF-8) → the nearest fuelled truck of the matching fuel type is
  chosen → Safe/Fast routes → confirm. (Supersedes the W11 F6 one-click recommendation.)
- F1 source is a **mobile truck** (mover = truck → unit). Depot-as-source is F2.
- Route options reuse the unit's road router; `metric` defaults to Safe.

## Dependencies

- Wave-10 routing/move-order + Wave-5 refuel co-location transfer (reused, not modified).

## Known Issues

See frontmatter.

## Bugs

(none yet)
