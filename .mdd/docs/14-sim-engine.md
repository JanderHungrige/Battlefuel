---
id: 14-sim-engine
title: Sim Engine & WebSocket
edition: MDD
depends_on: [13-move-orders, 08-unit-instances, 01-unit-stats-model]
relates: [16-live-movement-ui]
source_files:
  - backend/app/services/sim.py
  - backend/app/services/sim_runner.py
  - backend/app/api/ws.py
  - backend/app/main.py
  - backend/app/config.py
routes:
  - "WS /api/v1/ws"
models: []
test_files:
  - backend/tests/test_sim.py
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [simulation, real-time, websocket, movement, fuel, asyncio]
path: Sim/Engine
integration_contracts:
  - function: "WS /api/v1/ws unit_update messages"
    when: "live-movement-ui (F16) animates units + live fuel"
satisfies_contracts:
  - from: 13-move-orders
    function: "list_active / set_progress"
    when: "the tick advances active orders and completes them"
    status: done
    verified_at: "backend/app/services/sim_runner.py:76"
security_read_sites: []
known_issues:
  - "Sim runs only when create_app(enable_sim=True) (the production app); tests build the app without it."
  - "Backend tests mutate the shared dev DB (instances/orders); re-seed for a clean demo. A dedicated test DB is future work."
  - "Out-of-fuel mid-route is not yet enforced (fuel clamps at 0 but movement continues); refine in a later wave."
sister_projects: []
---

# 14 — Sim Engine & WebSocket

## Purpose
The continuous real-time clock: advances active move orders so units physically traverse
their routes while fuel depletes, and streams every change to clients over a WebSocket —
delivering the "watch the unit move as fuel depletes" half of the Wave 3 demo.

## Architecture
- `services/sim.py` — pure math: `haversine_m`, `polyline_length_m`, `point_at`, and
  `advance(order, fuel, unit_type, dt_game_s) → SimStep` (next progress/position/fuel/status).
- `services/sim_runner.py` — `SimEngine`: an asyncio loop ticking every `sim_tick_seconds`
  real time by `sim_tick_seconds × sim_time_scale` game-seconds; per active order it updates
  `move_orders.progress_m`/status and the unit's position + fuel, then broadcasts.
- `api/ws.py` — `ConnectionManager` + `WS /api/v1/ws`.
- `main.py` — `create_app(enable_sim=True)` runs the loop via FastAPI lifespan (off in tests).
- `config.py` — `sim_time_scale` (default 60), `sim_tick_seconds` (default 1).

## API Endpoints
- `WS /api/v1/ws` — pushes `unit_update` messages: `{instance_id, order_id, lat, lon,
  fuel_l, status, progress_m, distance_m}`.

## Business Rules
- Distance per tick = road speed × game-time elapsed; fuel burned = normal consumption ×
  game-time; fuel clamped ≥ 0.
- On `progress ≥ route length` the order is `complete` and the unit snaps to the endpoint.

## Data Flow
Tick → `move_orders.list_active` → `advance` → update order + `unit_instances`
(position/fuel) → `ConnectionManager.broadcast` → connected clients (F16).

## Dependencies
- `13-move-orders` (active orders), `08-unit-instances` (units), `01-unit-stats-model`
  (speed/consumption).

## Security
The WebSocket is read-only (server→client broadcasts; client messages are ignored). No
user input drives DB writes here.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
