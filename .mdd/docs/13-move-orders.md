---
id: 13-move-orders
title: Move Orders
edition: MDD
depends_on: [12-route-planning-api, 08-unit-instances]
relates: [14-sim-engine, 15-move-planning-ui]
source_files:
  - backend/app/domain/move_order.py
  - backend/app/models/move_order.py
  - backend/app/providers/move_orders.py
  - backend/app/services/move_order_service.py
  - backend/app/api/move_orders.py
  - backend/alembic/versions/0005_create_move_orders.py
routes:
  - "POST /api/v1/move-orders"
  - "POST /api/v1/move-orders/{order_id}/confirm"
  - "POST /api/v1/move-orders/{order_id}/cancel"
  - "GET /api/v1/move-orders"
  - "GET /api/v1/move-orders/{order_id}"
models:
  - move_orders
test_files:
  - backend/tests/test_move_orders.py
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [move-orders, routing, orders, fastapi, postgis]
path: Routing/Orders
integration_contracts:
  - function: "move_orders.list_active / set_progress"
    when: "the sim engine (F14) advances active orders and completes them"
satisfies_contracts:
  - from: 12-route-planning-api
    function: "create_move_order (re-plans chosen metric server-side)"
    when: "POST /move-orders"
    status: done
    verified_at: "backend/app/services/move_order_service.py:42"
security_read_sites: []
known_issues:
  - "Server re-plans the chosen metric on create (authoritative); the client's displayed geometry is not trusted."
sister_projects: []
---

# 13 — Move Orders

## Purpose
Persists a unit's committed route and its lifecycle (pending → active → complete /
cancelled). Confirming an order is what hands it to the sim engine to execute.

## Architecture
- `domain/move_order.py` — `MoveOrderStatus` + `MoveOrder` schema.
- `models/move_order.py` — `MoveOrderRow` (`move_orders`, geometry as JSONB, status index).
- `providers/move_orders.py` — `MoveOrderProvider` (create/get/list_all/list_active/
  set_status/set_progress) + `DbMoveOrderProvider` + factory.
- `services/move_order_service.py` — `create_move_order` (re-plans the chosen metric, builds
  + persists a pending order).
- `api/move_orders.py` — create / confirm / cancel / list / get.

## Data Model
`move_orders`: `id` (PK), `instance_id`, `status`, `metric`, `distance_m`, `duration_s`,
`fuel_consumed_l`, `progress_m`, `geometry` (JSONB), `created_at`. Indexed on `status`.

## API Endpoints
- `POST /api/v1/move-orders` (201) — `{instance_id, dest_lat, dest_lon, metric}` → pending
  order (404 unknown instance, 409 type missing, 422 unroutable).
- `POST …/{id}/confirm` → active · `POST …/{id}/cancel` → cancelled (404 unknown).
- `GET /api/v1/move-orders` · `GET …/{id}` (404 unknown).

## Business Rules
- Create re-plans the route server-side for the chosen metric (authoritative geometry).
- Confirm transitions pending → active (the sim then advances it); cancel → cancelled.

## Data Flow
Create → resolve instance/type → route (F11/F12) → persist pending. Confirm → active →
sim engine (F14) updates `progress_m`/`status` and the unit's fuel.

## Dependencies
- `12-route-planning-api` (route + estimates), `08-unit-instances` (the unit).

## Security
Writes are scoped to creating/transitioning orders; ids are key lookups; geometry is
server-computed, not client-supplied.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
