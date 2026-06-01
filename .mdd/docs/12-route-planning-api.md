---
id: 12-route-planning-api
title: Route Planning API
edition: MDD
depends_on: [11-routing-graph, 08-unit-instances, 01-unit-stats-model]
relates: [13-move-orders, 15-move-planning-ui]
source_files:
  - backend/app/domain/route.py
  - backend/app/services/route_planner.py
  - backend/app/api/routes.py
routes:
  - "POST /api/v1/routes/plan"
models: []
test_files:
  - backend/tests/test_route_planning.py
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [routing, route-planning, fuel, duration, fastapi]
path: Routing/Planning
integration_contracts:
  - function: "POST /api/v1/routes/plan"
    when: "move-planning-ui (F15) shows options; a chosen RouteOption seeds a move order (F13)"
satisfies_contracts:
  - from: 11-routing-graph
    function: "RoutingProvider.shortest_path"
    when: "fastest + safest path computation"
    status: done
    verified_at: "backend/app/services/route_planner.py:69"
security_read_sites: []
known_issues:
  - "Fuel estimate uses normal consumption at road speed; combat/idle burn and off-road are out of scope here."
sister_projects: []
---

# 12 — Route Planning API

## Purpose
Turns the raw routing graph into commander-facing decisions: for a placed unit and a
destination, returns the **fastest** and **safest** routes with **duration**, **fuel
remaining on arrival**, and **route threat level** — the core of the Wave 3 demo-state.

## Architecture
- `domain/route.py` — `RouteOption` (path + duration/fuel + `sufficient_fuel`).
- `services/route_planner.py` — `build_option` (pure: layers duration & fuel onto a
  `RoutePath`) and `plan_routes` (fastest + safest for a unit/destination).
- `api/routes.py` — `POST /api/v1/routes/plan`.

## API Endpoints
- `POST /api/v1/routes/plan` — body `{instance_id, dest_lat, dest_lon}` → `RouteOption[]`
  (fastest, safest). `404` unknown instance; `409` instance's type missing from catalog;
  `422` no route to destination.

## Business Rules
- Start = the unit instance's current position; start fuel = its `current_fuel_liters`
  (or the type's capacity if no telemetry).
- `duration = distance / road speed`; `fuel_consumed = normal consumption × duration`;
  `sufficient_fuel = remaining ≥ 0` (remaining clamped to ≥ 0 for display).

## Data Flow
Request → resolve instance (F08) + unit type (F01) → `RoutingProvider.shortest_path` ×2
(F11) → `build_option` adds duration/fuel → `RouteOption[]`.

## Dependencies
- `11-routing-graph` (paths), `08-unit-instances` (start/fuel), `01-unit-stats-model` (speed/consumption).

## Security
Read-only planning. `instance_id` is a key lookup; coordinates are numeric. No writes.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
