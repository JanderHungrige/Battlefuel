---
id: 69-order-history-panel
title: Order History Panel + NATO Fulfilment Stages
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: [68-order-fuel-mask]
source_files:
  - backend/app/domain/buy_order.py
  - backend/app/models/buy_order.py
  - backend/app/providers/buy_orders.py
  - backend/app/services/buy_service.py
  - backend/app/services/sim_runner.py
  - backend/alembic/versions/0013_add_buy_order_nato_stage.py
  - frontend/src/lib/natoStage.ts
  - frontend/src/components/OrderHistoryPanel.tsx
  - frontend/src/hooks/useOrderHistory.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/components/SupplyPanel.tsx
routes:
  - GET /api/v1/buy-orders
models:
  - buy_orders
test_files:
  - backend/tests/test_buy_orders.py
  - frontend/src/lib/natoStage.test.ts
  - frontend/src/components/OrderHistoryPanel.test.tsx
  - frontend/src/hooks/simSocket.test.ts
data_flow: writes-existing
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, order-history, nato-stages, buy-order, sim-clock, jlsg, jtf, opcon]
path: OF-8/Supply
integration_contracts: []
satisfies_contracts:
  - from: 68-order-fuel-mask
    function: order history renders an order's platform / inform / destination metadata
    when: an order is listed in the history panel
    status: done
    verified_at: "frontend/src/components/OrderHistoryPanel.tsx:60"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 69 — Order History Panel + NATO Fulfilment Stages

## Purpose

Add an **Order History** panel to the OF-8 Joint-Force Supply view that lists all historic +
current fuel orders and tracks each through the **seven NATO fulfilment stages**. The current
stage **auto-advances on the sim clock at 30 game-seconds per stage**; order history persists.

## Architecture

The `buy_orders` model gains a `nato_stage` + per-stage countdown. The live sim
(`SimEngine.advance_buy_orders`) drives stage progression via the pure
`progress_buy_order_stages`, broadcasting a `buy_order_update` (now carrying `nato_stage`) on
every stage change; arriving at the terminal stage delivers the fuel (the existing
`adjust_stock` path). The frontend `useOrderHistory` lists `GET /buy-orders` and refetches on
each supply frame; `OrderHistoryPanel` renders a 7-step stage track; `natoStage.ts` is the
shared label/order module (mirrors the backend enum).

## Data Model

`buy_orders` gains (defaulted, back-compatible):
- `nato_stage` (str, default `placed`) — current fulfilment stage
- `stage_remaining_game_s` (float, default 30) — game-seconds left in the current stage

Stages (in order): `placed → confirmed_jlsg → confirmed_jtf → confirmed_provider → on_route →
reached_jlsg → reached_opcon`.

## API

`GET /api/v1/buy-orders` returns every order (history) including `nato_stage`. The
`buy_order_update` WS frame carries `nato_stage` + `stage_remaining_game_s`.

## Business Rules

- Each stage dwells exactly `ORDER_STAGE_SECONDS` (30) game-seconds; a single sim tick can cross
  multiple stages (the helper is deterministic and idempotent for large `dt`).
- Reaching `reached_opcon` is delivery: stock is increased once via `adjust_stock` and the order
  status flips to `delivered`. The terminal stage never re-delivers.
- Cancelled orders stop advancing and render as "Cancelled".
- Only confirmed (ACTIVE) orders advance — a PENDING (unconfirmed) order does not progress.

## Data Flow

`nato_stage`: advanced in `progress_buy_order_stages` (sim) → persisted on `buy_orders` →
broadcast via `buy_order_update` (bumps `supplyTick`) → `useOrderHistory` refetch → panel track.

## Dependencies

- 68 (order-fuel-mask) — supplies the order metadata the history rows display.

## Security

Read endpoint over server-owned order data; no new external input beyond F3's create fields.

## Known Issues

- `deliver_due_buy_orders` (the original lead-time delivery path) is retained for its unit tests
  but is no longer wired into the live sim, which now uses stage progression.

## Bugs

(none yet)
