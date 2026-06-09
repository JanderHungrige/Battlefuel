---
id: 85-rendezvous-routing
title: Rendezvous Routing — both movers to a sector, transfer on meeting
edition: MDD
depends_on: [74-routed-fuel-run, 26-refuel-orders, 13-move-orders]
relates: [75-depot-source-fuel-run, 83-safe-offroad-detour]
source_files:
  - backend/app/services/rendezvous_service.py
  - backend/app/api/rendezvous.py
  - backend/app/main.py
routes:
  - POST /api/v1/rendezvous/plan
  - POST /api/v1/rendezvous
models: []
test_files:
  - backend/tests/test_rendezvous.py
data_flow: .mdd/audits/flow-rendezvous-routing-2026-06-09.md
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [rendezvous, fuel-run, refuel, routing, co-location, h3, sim]
path: Supply/Rendezvous
integration_contracts:
  - function: "rendezvous plan/create (truck_routes + unit_routes, fuel-to-meet, sector center)"
    when: "F3 plan-rendezvous-ui consumes POST /rendezvous/plan; F2 confirm-launch reuses start_rendezvous; F6 plan-move-with-refueling reuses the sector-center + dual-route plan"
    consumers: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 85 — Rendezvous Routing

## Purpose

Turns a one-sided routed fuel run (Wave 12: one mover drives to a fixed point) into a
**two-sided rendezvous**: given a fuel truck, a target unit, and a meeting **sector**, plan
Safe + Fast routes for **both** movers to the sector, then on "order now" dispatch the pair
plus a refuel order that fires via the existing co-located transfer when they meet. Also
surfaces each mover's **fuel-to-meet** (the burn to reach the sector). This is the backend
foundation the rest of Wave 13 builds on (F2 scheduling, F3 UI, F6 add-refuel-stop).

## Architecture

Pure orchestration over existing pieces — **no new DB table, no migration**:

- **Sector resolution.** The theater grid is H3 res-8 (`tile_grid.DEFAULT_RESOLUTION = 8`),
  not MGRS. A clicked sector point is snapped to its H3 cell
  (`h3.latlng_to_cell(lat, lon, 8)`); the meeting coordinate is `tile_grid.cell_center(cell)`.
  Both movers route to that single center, so on arrival both occupy the same H3 cell.
- **Plan.** `plan_routes()` (`route_planner.py`, W10/W16) is called once per mover →
  `[fastest(FAST), safest(SAFE)]` `RouteOption`s. Each option already carries
  `fuel_consumed_l` (= fuel-to-meet) and `threat_max`.
- **Create ("order now").** Two `create_move_order()` calls (truck→sector, unit→sector) +
  one `RefuelOrder` constructed directly with `rendezvous = sector center` (mirroring the
  depot branch of `start_fuel_run`, because the W12 explicit-truck path hardcodes the
  rendezvous to the unit's *current* position). All three orders are activated together.
- **Transfer.** Unchanged: `sim_runner.complete_refuels` → `try_complete_refuel` fires when
  `co_located(unit_h3, truck_h3)` is true. Both destinations are the same sector cell, so it
  fires when the second mover arrives; the first arrival's move order completes and it waits.

```
POST /rendezvous/plan ─▶ resolve sector center ─▶ plan_routes(truck) + plan_routes(unit)
                          └▶ { sector, truck_routes[], unit_routes[] }   (fuel-to-meet = option.fuel_consumed_l)

POST /rendezvous ───────▶ start_rendezvous():
                            create_move_order(truck→sector, metric)
                            create_move_order(unit→sector, metric)
                            RefuelOrder(unit, truck, rendezvous=sector) → create
                            activate all three  ─▶ { truck_move_order, unit_move_order, refuel_order }
                          (rollback any created order if a later step fails)
```

## Data Model

No new model. Reuses `MoveOrder` (`domain/move_order.py`) and `RefuelOrder`
(`domain/refuel.py`). The refuel order's `rendezvous_lat/lon/h3` is set to the **sector
center** (not the unit's current position).

## API Endpoints

### `POST /api/v1/rendezvous/plan`
Plan both movers' routes to a sector. **Auth:** none (single-user, server-authoritative).
- **Request:** `{ truck_id: str, unit_id: str, sector_lat: float, sector_lon: float, mode: RouteMode = ROAD }`
- **Response 200:** `{ sector: { lat: float, lon: float, h3: str }, truck_routes: RouteOption[], unit_routes: RouteOption[] }`
- **Errors:** 404 unknown truck/unit (or unit type missing); 422 if either mover is unroutable to the sector.

### `POST /api/v1/rendezvous`  (status 201)
"Order now" — dispatch both movers + the refuel.
- **Request:** `{ truck_id: str, unit_id: str, sector_lat: float, sector_lon: float, metric: RouteMetric = SAFE, mode: RouteMode = ROAD }`
- **Response 201:** `{ truck_move_order: MoveOrder, unit_move_order: MoveOrder, refuel_order: RefuelOrder }` (all ACTIVE).
- **Errors:** 404 unknown truck/unit; 422 if a mover is unroutable or no valid refuel linkage (truck not a fuelled FUEL_SUPPLY of the unit's fuel type, or truck == unit).

## Business Rules

- **Sector = H3 cell center** at the theater resolution. Both movers route to the identical
  center coordinate so co-location is guaranteed on arrival.
- **fuel-to-meet** = the chosen metric's `RouteOption.fuel_consumed_l` for each mover. No new
  computation — reuses the single existing estimate path (`build_option`).
- **First arrival waits.** The first mover to reach the sector completes its move order and
  stops there; the refuel order stays ACTIVE until both are co-located, then transfers.
- **Refuel validity** (reuses W12 rules): truck must be a fuelled `FUEL_SUPPLY` whose fuel
  type matches the unit; `truck_id != unit_id`. On any failure after a move order is created,
  roll the created orders back to CANCELLED and return `None` (→ 422).
- **Explicit truck only** — no recommender (so doc 26's `RefuelRecommender` contract does not
  apply, exactly as in W12 routed fuel runs).

## Data Flow

See `.mdd/audits/flow-rendezvous-routing-2026-06-09.md`. RouteOption transport shape is
unchanged from W10; the only new transport is the plan response envelope pairing the two
movers' option lists with the resolved sector.

## Dependencies

- **74-routed-fuel-run** — `start_fuel_run` pattern (move + refuel, activate together, rollback).
- **26-refuel-orders** — `co_located` / `try_complete_refuel` co-location transfer; `RefuelOrder` model.
- **13-move-orders** — `create_move_order`, `MoveOrder` model, sim advancement.
- Routing (`plan_routes`, W10/W16 incl. 82-enemy-avoidance-cost, 83-safe-offroad-detour) reused unchanged.

## Security

Single-user, server-authoritative. The create path re-plans the chosen metric server-side via
`create_move_order` (the client's displayed geometry is not trusted — same posture as
13-move-orders). No external/untrusted callers, no new stored secrets, no new network calls.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
