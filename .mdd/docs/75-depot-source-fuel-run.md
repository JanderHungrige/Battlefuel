---
id: 75-depot-source-fuel-run
title: Depot-Source Fuel Run (unit → depot)
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-12
wave_status: active
depends_on: [74-routed-fuel-run]
source_files:
  - backend/app/domain/refuel.py
  - backend/app/models/refuel_order.py
  - backend/app/providers/refuel_orders.py
  - backend/app/services/refuel_service.py
  - backend/app/services/fuel_run_service.py
  - backend/app/services/sim_runner.py
  - backend/app/api/fuel_runs.py
  - backend/app/services/supply_overview.py
  - backend/alembic/versions/0015_refuel_order_depot_source.py
  - frontend/src/lib/fuelRun.ts
  - frontend/src/hooks/useFuelRun.ts
  - frontend/src/api/types.ts
routes:
  - POST /api/v1/fuel-runs
models:
  - refuel_orders
  - fuel_stocks
test_files:
  - backend/tests/test_fuel_runs.py
  - frontend/src/lib/fuelRun.test.ts
data_flow: writes-existing
last_synced: 2026-06-07
status: complete
phase: all
mdd_version: 11
tags: [of8, fuel-run, depot, refuel, fuel-stock, routing]
path: OF-8/Fuel Run
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 75 — Depot-Source Fuel Run (unit → depot)

## Purpose

Extend the unit-first fuel run so the closest fuel source can be a **fixed depot**. Because
depots can't move, the **thirsty unit routes to the depot** and fills from the depot's stock on
arrival — **draining that stock** (a low depot then triggers the Wave-11 low-site proposal).

## Architecture

`refuel_orders` gains a nullable `depot_id` and `truck_id` becomes nullable (migration 0015): an
order is **truck-sourced** (truck comes to the unit) or **depot-sourced** (unit goes to the
depot). The sim's `complete_refuels` routes depot-sourced orders to a new
`try_complete_depot_refuel`, which on co-location fills the unit and decrements the depot
`FuelStock` via `adjust_stock`. `start_fuel_run` accepts a `depot_id`: it routes the **unit** to
the depot and creates a depot-sourced refuel order. Frontend `nearestFuelSource` ranks mobile
trucks **and** stocked depots; if a depot wins, the unit is the mover and routes to the depot.

## Data Model

`refuel_orders`: `+ depot_id (str, nullable)`; `truck_id` now nullable. Exactly one of
`truck_id` / `depot_id` is set per order.

## API

`POST /api/v1/fuel-runs` request: `truck_id` and `depot_id` are both optional — supply one.
For a depot run: `mover_id == unit_id`, `depot_id` set, `dest_*` = the depot position.

## Business Rules

- Unit-first nearest-source considers trucks (fuel > 0) **and** depots (stock of the unit's fuel
  type > 0). Closest wins.
- Depot source → the unit moves to the depot; transfer drains the depot's stock (clamped ≥ 0).
- Truck source → unchanged (truck moves to the unit).
- Co-location for a depot order compares the unit's H3 cell to the depot's H3 cell.

## Dependencies

- 74 (routed-fuel-run) — the fuel-run plumbing this extends.
- Wave-11 supply stock (`adjust_stock`, `FuelStock`) — drained on depot refuel.

## Known Issues

(none)

## Bugs

(none yet)
