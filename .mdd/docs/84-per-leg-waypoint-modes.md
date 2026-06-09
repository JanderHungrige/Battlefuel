---
id: 84-per-leg-waypoint-modes
title: Per-Leg Waypoint Modes
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-16
wave_status: active
depends_on: []
source_files:
  - backend/app/services/route_planner.py
  - backend/app/services/move_order_service.py
  - backend/app/api/routes.py
  - backend/app/api/move_orders.py
  - frontend/src/api/types.ts
  - frontend/src/hooks/useMovePlanning.ts
routes:
  - POST /api/v1/routes/plan-waypoints
  - POST /api/v1/move-orders/waypoints
models: []
test_files:
  - backend/tests/test_route_planner.py
data_flow: writes-existing
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [routing, waypoints, mode, offroad, per-leg]
path: Routing/Waypoints
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "Per-leg mode affects PLANNING (which router/geometry + estimate per leg); the sim's live
    traversal speed still ignores mode (pre-existing W10 TODO)."
security_read_sites: []
sister_projects: []
---

# 84 — Per-Leg Waypoint Modes

Each manual waypoint leg can now use its **own** travel mode (road / off-road / hybrid / direct)
instead of one mode applied to the whole route. Before, switching the mode re-planned every leg.

## What it does
- **Backend** — `Waypoint` gains an optional `mode`; the plan + create endpoints pass a per-leg
  `modes` list (`waypoint.mode or request.mode`). `route_planner.leg_modes_for` resolves it,
  `plan_legs_per_mode` plans each leg with **its own** mode's provider + speed, and
  `aggregate_leg_options` sums duration + fuel **per leg at each leg's speed** (so a mixed
  road+off-road route is estimated correctly), stitches the geometry, and takes max threat.
  `plan_waypoint_routes` + `create_move_order_waypoints` use these. Backward compatible: no per-leg
  modes → the single `mode` applies to all legs (unchanged behaviour).
- **Frontend** — each waypoint **captures the currently-selected mode when placed**
  (`useMovePlanning`): set the mode → click a point → that leg uses it. Changing the mode afterward
  affects only the **next** point placed, not existing legs (no whole-route re-plan). The per-leg
  modes are sent on plan + create.

## Key decisions
- The capture-at-placement model means the existing travel-mode selector *is* the per-leg control
  ("road, click; off-road, click" → mixed legs) — no new widget needed, and it matches the
  requested "change only the current waypoint" behaviour.
- Planning only: the sim's traversal speed ignoring mode is a pre-existing W10 limitation, unchanged.

## Tests (`test_route_planner.py::TestPerLegModes`)
`leg_modes_for` default-fill / explicit / length-mismatch; `aggregate_leg_options` sums per-leg
duration + fuel at each leg's own speed, stitches geometry (shared point deduped), threat = max.

## Verification
ruff + mypy(strict, 90 files) + backend **342 tests**; frontend tsc + eslint + **218 tests** +
prod build green. ⚠ No annotate/reseed needed (planning-only). **Live gate pending.**
