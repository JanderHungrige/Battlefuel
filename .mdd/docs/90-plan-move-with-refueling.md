---
id: 90-plan-move-with-refueling
title: Plan Move with Refueling — add a refuel stop on the way (nearest tanker)
edition: MDD
depends_on: [85-rendezvous-routing, 13-move-orders, 84-per-leg-waypoint-modes]
relates: [74-routed-fuel-run]
source_files:
  - backend/app/services/move_refuel_service.py
  - backend/app/api/move_orders.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/components/MoveRoutesPanel.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/move-orders/with-refuel
models: []
test_files:
  - backend/tests/test_move_refuel.py
  - frontend/src/components/MoveRoutesPanel.test.tsx
data_flow: greenfield
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [move-order, refuel, rendezvous, waypoint, threat, of-4]
path: Movement/Refuel Stop
integration_contracts: []
satisfies_contracts: []
known_issues: []
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 90 — Plan Move with Refueling

## Purpose

A Google-Maps "add stop" for a planned move: when a unit is planning a route to a destination,
**Add refuel stop** inserts a refuel rendezvous **on the way** — the nearest compatible tanker,
at a meeting cell **preferably outside a threat tile** — stitched into the move so the unit drives
**unit → rendezvous → destination**, the tanker drives to the rendezvous, and the existing
co-location transfer tops the unit off when they meet.

## Architecture

`move_refuel_service.plan_move_with_refuel` (backend), reusing Wave-12/13 pieces:

1. **Nearest tanker** — the nearest fuelled `FUEL_SUPPLY` instance whose fuel type matches the
   unit (same filter as the nearest refuel recommender; haversine distance).
2. **Rendezvous cell, nudged out of threat** — start at the tanker's H3 cell; if it is a
   threat-L5 sector, pick the nearest ring-1 neighbour (`h3.grid_disk`) whose tile is sub-L5,
   else keep the tanker's cell. The meeting point is that cell's centre.
3. **Stitch the move** — the unit gets a **waypoint** move order `unit → rendezvous → dest`
   (`create_move_order_waypoints`, W16 per-leg modes); the tanker gets a move order to the
   rendezvous (`create_move_order`); a refuel order links unit↔tanker at the rendezvous cell.
4. **Activate all three together** (rolling back created orders on any failure), exactly like
   `start_rendezvous` (F1). The transfer fires via the unchanged co-location check; the unit then
   continues to its destination (its move order's later legs).

New endpoint `POST /api/v1/move-orders/with-refuel`. The frontend adds an **Add refuel stop**
action to the move-planning panel (enabled once a destination is chosen).

## API Endpoints

### `POST /api/v1/move-orders/with-refuel` (201)
- **Request:** `{ instance_id, dest_lat, dest_lon, metric=safe, mode=road }`
- **Response:** `{ rendezvous: {lat,lon,h3}, unit_move_order, tanker_move_order, refuel_order }`
- **Errors:** 404 unknown unit; 422 no compatible tanker / unroutable.

## Business Rules

- Tanker must be a fuelled `FUEL_SUPPLY` of the unit's fuel type; nearest by great-circle distance.
- The rendezvous prefers a non-threat cell adjacent to the tanker when the tanker sits in threat.
- The unit's route is the full `unit → rendezvous → dest` waypoint path (the refuel is *on the
  way*, not a separate trip). Server re-plans authoritatively.

## Data Flow

Greenfield over F1/W12 pieces. The unit move order's geometry is the stitched multi-leg path;
the refuel order's rendezvous is the chosen cell.

**Map preview (2026-06-09 correction):** on success the App draws the dispatched unit and tanker
legs on the shared `rendezvous-routes` layer (via `refuelStopRoutes`) instead of clearing them, so
the operator sees the stitched route + the tanker's leg immediately.

## Dependencies

- **85-rendezvous-routing** — the dispatch-the-pair-+-refuel pattern (`start_rendezvous`) reused.
- **13-move-orders** / **84-per-leg-waypoint-modes** — `create_move_order(_waypoints)`.
- **74-routed-fuel-run** — refuel-order construction + co-location transfer.

## Security

Server-authoritative; no secrets; re-plans server-side.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
