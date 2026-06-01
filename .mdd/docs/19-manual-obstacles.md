---
id: 19-manual-obstacles
title: Manual Obstacles
edition: MDD
depends_on: [17-tile-cost-model, 11-routing-graph, 07-hex-tile-model-api]
relates: [22-obstacle-tile-ops-ui, 18-dynamic-tile-updates]
source_files:
  - backend/alembic/versions/0006_create_obstacles.py
  - backend/app/models/obstacle.py
  - backend/app/domain/obstacle.py
  - backend/app/providers/obstacles.py
  - backend/app/api/obstacles.py
  - backend/app/providers/routing.py
  - backend/app/config.py
  - backend/app/main.py
routes:
  - POST /api/v1/obstacles
  - GET /api/v1/obstacles
  - DELETE /api/v1/obstacles/{obstacle_id}
models:
  - obstacles
test_files:
  - backend/tests/test_obstacles.py
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [obstacles, routing, pgrouting, blocking, h3, websocket]
path: Routing/Obstacles
integration_contracts:
  - function: "obstacle_update WS frame"
    when: "an obstacle is added or removed"
    note: "frontend (22-obstacle-tile-ops-ui) draws/clears the obstacle"
satisfies_contracts: []
security_read_sites: []
known_issues: []
---

# 19 — Manual Obstacles

## Purpose
Let the operator place obstacles the router avoids: an obstacle blocks an H3 cell, so every
routing edge in that cell is excluded from the graph and new routes go around it. Persisted,
listable, removable; each change broadcasts so the map reflects it live.

## Architecture
An obstacle is a blocked H3 cell (granularity = tile, reusing the `cell_h3` column from #18).
The routing query excludes edges whose `cell_h3` is in the `obstacles` set, so **all** new
plans (fast & safe) avoid obstacles with no re-annotation needed.

```
POST /obstacles {lat,lon}  → resolve H3 → insert obstacles row → obstacle_update WS
routing.shortest_path: edges WHERE cell_h3 NOT IN (SELECT h3_index FROM obstacles)
DELETE /obstacles/{id}     → remove row → obstacle_update WS
```

Obstacles affect **route planning** (and any new order's geometry). Already-active orders keep
their committed geometry; an obstacle dropped on a moving unit's path does not retroactively
reroute it (documented limitation — re-planning active orders is out of scope this wave).

## Data Model
New `obstacles` table: `id` (uuid hex, pk), `h3_index` (text, indexed), `kind` (text, default
`manual`), `created_at`. `Obstacle` domain model mirrors it; `ObstacleCreate` takes `lat`,
`lon`, optional `kind`.

## API Endpoints
- `POST /api/v1/obstacles` — body `{lat, lon, kind?}` → resolves the containing H3 cell,
  inserts an obstacle, returns `Obstacle` (201). Broadcasts `obstacle_update` (added).
- `GET /api/v1/obstacles` — list all obstacles.
- `DELETE /api/v1/obstacles/{obstacle_id}` — remove; `404` if absent. Broadcasts
  `obstacle_update` (removed).

`obstacle_update` frame: `{type, action: "added"|"removed", id, h3_index, kind}`.

## Business Rules
- Obstacle granularity is one H3 cell (whole hex). Multiple obstacles in one cell are allowed
  (all block it; removing one leaves others).
- Routing exclusion is dynamic (subquery), so placing/removing an obstacle takes effect on the
  next plan with no graph rebuild.
- Blocking that disconnects the destination ⇒ `POST /routes/plan` returns `422` (no route).

## Data Flow
See `.mdd/audits/flow-manual-obstacles-2026-06-01.md`. Writes `obstacles`; reads it in the
routing edge set. `lat/lon` validated as floats; `kind` is a short string.

## Dependencies
- **17-tile-cost-model / 11-routing-graph** (`ways`, `cell_h3`, routing query),
  **07-hex-tile-model-api** (H3 resolution).

## Security
Single-user, server-authoritative. `ObstacleCreate` validates types; no untrusted file/network
input, no secrets. Obstacle ids are server-generated uuids.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
