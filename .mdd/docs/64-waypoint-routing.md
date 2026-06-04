---
id: 64-waypoint-routing
title: Waypoint Routing (Multi-Leg)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-10
wave_status: active
depends_on: [63-routing-mode-multi-route-ui, 12-route-planning-api, 13-move-orders]
relates: [61-hybrid-direct-routing-modes]
source_files:
  - backend/app/services/route_planner.py
  - backend/app/services/move_order_service.py
  - backend/app/api/routes.py
  - backend/app/api/move_orders.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/hooks/useMovePlanning.ts
  - frontend/src/components/MoveRoutesPanel.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/routes/plan-waypoints
  - POST /api/v1/move-orders/waypoints
models:
  - move_orders
test_files:
  - backend/tests/test_route_planner.py
  - backend/tests/test_route_planning.py
  - backend/tests/test_move_orders.py
  - frontend/src/api/client.test.ts
data_flow: reads-existing
last_synced: 2026-06-04
status: complete
phase: all
mdd_version: 11
tags: [routing, waypoints, movement, route-planning, move-orders]
path: Map/Movement
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "The route builds live as each waypoint is dropped (re-planned through the points so far via planWaypointPreview), so the path is visible incrementally on the map. Individual waypoint dot markers are still not drawn — the live route line + the panel count convey the points; dedicated markers are optional polish."
  - "Hybrid waypoint routes use the road provider for every leg (no per-leg best-of road/off-road). offroad/direct waypoint routes use the terrain router. Per-leg hybrid fusion can follow."
---

# 64 — Waypoint Routing (Multi-Leg)

## Purpose

Lets the operator plan a route through chosen intermediate points instead of a single
click-destination — "Start routing → drop waypoints → End routing → Confirm move order" — so a
unit can be steered along a specific corridor. Legs are planned with the active travel mode and
stitched into one route.

## Architecture

**Backend** (`route_planner` + `move_order_service`):
- `stitch_paths(legs)` — concatenates ordered `RoutePath` legs into one, dropping the duplicated
  shared waypoint, summing distance/effective/fuel, taking the max + distance-weighted-average
  threat, and OR-ing `degraded`.
- `plan_legs(...)` plans each leg start→wp1→…→wpN for a metric (None if any leg is unroutable);
  `waypoint_provider_and_speed(...)` picks the router/speed (road/hybrid → road provider;
  offroad/direct → terrain at off-road speed).
- `plan_waypoint_routes(...)` → fastest + safest stitched `RouteOption[]`.
- `create_move_order_waypoints(...)` → stitches the chosen-metric legs and persists a pending
  move order whose geometry is the full multi-leg path (server-authoritative — the client never
  sends geometry).

**Endpoints:** `POST /api/v1/routes/plan-waypoints` (preview options) and
`POST /api/v1/move-orders/waypoints` (create; then the existing `/confirm` activates it).

**Frontend** (`useMovePlanning` + `MoveRoutesPanel` + `App`):
- `Waypoint routing — start` → `waypointMode` on; map clicks call `addWaypoint` (App routes
  `onPickDestination` to `addWaypoint` while in waypoint mode).
- `Remove last waypoint` pops; `End routing` calls `api.planWaypoints` and shows the route options.
- `Confirm move order` → `confirmMove` branches to `api.createWaypointMoveOrder` when waypoints
  exist, else the single-destination path.

## API

- `POST /api/v1/routes/plan-waypoints` — body `{instance_id, waypoints:[{lat,lon}], mode?}` →
  `RouteOption[]`. `422` if `waypoints` empty or no route; `404`/`409` for unknown unit/type.
- `POST /api/v1/move-orders/waypoints` — body `{instance_id, waypoints, metric, mode?}` →
  pending `MoveOrder` (201). Same error cases.

## Business Rules

1. Waypoints are visited in order: start → wp1 → … → wpN (wpN is the destination).
2. A waypoint route is unroutable (422) if any single leg is unroutable.
3. The persisted move order's geometry is the stitched multi-leg path; the sim traverses it
   unchanged (and F1/F3 halt + sub-stepping apply per usual).
4. Determinism: `stitch_paths` is pure; leg planning reuses the deterministic routers.

## Data Flow

waypoints (UI) → `api.planWaypoints` → `plan_waypoint_routes` (`plan_legs` + `stitch_paths`) →
`RouteOption[]` → panel. Confirm → `api.createWaypointMoveOrder` → `create_move_order_waypoints`
→ persisted `MoveOrder.geometry` (stitched) → sim.

## Dependencies

- **63-routing-mode-multi-route-ui** — the planning panel + travel mode this extends.
- **12-route-planning-api / 13-move-orders** — `build_option`, the order model + provider.

## Security

Server-authoritative: the client sends waypoints (typed lat/lon), never geometry; the backend
re-plans and stitches. No new storage beyond the existing move-order row.

## Known Issues

See frontmatter (waypoint-marker rendering is a live-gate polish; hybrid waypoint legs use roads).

## Bugs

(none yet)
