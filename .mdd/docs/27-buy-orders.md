---
id: 27-buy-orders
title: Buy Orders — Depot Fuel Procurement with Lead Time
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [24-fuel-supply-model, 14-sim-engine]
relates: [25-supply-stock-api, 29-of8-supply-ui]
source_files:
  - backend/app/domain/buy_order.py
  - backend/app/models/buy_order.py
  - backend/app/providers/buy_orders.py
  - backend/app/services/buy_service.py
  - backend/app/api/buy_orders.py
  - backend/app/services/sim_runner.py
  - backend/app/config.py
  - backend/app/main.py
  - backend/alembic/versions/0010_create_buy_orders.py
routes:
  - POST /api/v1/buy-orders
  - POST /api/v1/buy-orders/{order_id}/confirm
  - POST /api/v1/buy-orders/{order_id}/cancel
  - GET /api/v1/buy-orders
  - GET /api/v1/buy-orders/{order_id}
models:
  - buy_orders
  - fuel_stocks
test_files:
  - backend/tests/test_buy_orders.py
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [buy, procurement, supply, orders, depot, sim, lead-time]
path: Supply/Buy
integration_contracts: []
satisfies_contracts:
  - from: 24-fuel-supply-model
    function: "SupplyProvider.adjust_stock(session, depot_id, fuel_type, delta_liters)"
    when: "On delivery, depot stock is increased ONLY through adjust_stock — never a raw UPDATE."
    status: done
    verified_at: "backend/app/services/buy_service.py:74"
  - from: 24-fuel-supply-model
    function: "build_supply_provider(settings)"
    when: "Depot/stock validation + delivery obtain the provider via the factory."
    status: done
    verified_at: "backend/app/api/buy_orders.py:27"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 27 — Buy Orders — Depot Fuel Procurement with Lead Time

## Purpose

Let OF-8 procure fuel **into a depot**. A buy order has a target depot, fuel type, and
quantity; after a **lead time** advanced by the sim clock it is delivered and the depot's
stock increases. Server-authoritative, like move/refuel orders.

## Architecture

```
domain/buy_order.py     BuyOrder(+Status)
models/buy_order.py     BuyOrderRow
providers/buy_orders.py BuyOrderProvider(ABC)→Db; build_buy_order_provider()
services/buy_service.py create_buy_order(); advance_buy_order() (pure countdown); deliver via
                        sim hook using SupplyProvider.adjust_stock
api/buy_orders.py       POST/GET endpoints
sim_runner.py           advance_buy_orders() — counts down active orders, delivers, broadcasts
```

Lead time is tracked as a **countdown** (`remaining_game_s`), not an absolute due time, so it
survives sim/process restarts (the engine's game clock resets to 0 on start).

## Data Model

**`buy_orders`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | String, PK | uuid4 hex |
| `depot_id` | String | Target depot |
| `fuel_type` | String | `FuelType` to deliver |
| `quantity_liters` | Float | Amount ordered, ≥ 0 |
| `status` | String | `pending` → `active` → `delivered` / `cancelled` |
| `lead_time_game_s` | Float | Total delivery lead time (game seconds) |
| `remaining_game_s` | Float | Countdown remaining until delivery |
| `created_at` | DateTime | server default now |

Index `ix_buy_orders_status`.

## API Endpoints

| Method | Path | Body / Result |
|--------|------|---------------|
| POST | `/api/v1/buy-orders` | `{depot_id, fuel_type, quantity_liters, lead_time_game_s?}` → `BuyOrder` (201). 404 unknown depot; 422 depot has no stock row for that fuel type |
| POST | `/api/v1/buy-orders/{id}/confirm` | → `BuyOrder` (status `active`; sim counts it down) |
| POST | `/api/v1/buy-orders/{id}/cancel` | → `BuyOrder` (status `cancelled`) |
| GET | `/api/v1/buy-orders` | `list[BuyOrder]` |
| GET | `/api/v1/buy-orders/{id}` | `BuyOrder` (404 if unknown) |

## Business Rules

- **Create validation:** the depot must exist and already hold a `fuel_stocks` row for the
  ordered fuel type (delivery uses `adjust_stock`, which targets an existing row). Missing depot
  ⇒ 404; missing stock row ⇒ 422. `lead_time_game_s` defaults to
  `settings.buy_order_lead_time_game_s` when not supplied.
- **Delivery is sim-driven.** Each tick, `advance_buy_orders` decrements `remaining_game_s` of
  every `active` order by the tick's game-seconds via the pure `advance_buy_order` helper. When
  it reaches 0, the order is delivered: `SupplyProvider.adjust_stock(depot, fuel_type, +quantity)`
  (clamped to capacity), status → `delivered`, and a `buy_order_update` frame is broadcast.
- Stock is only ever increased through `adjust_stock` (24's contract) — never a raw UPDATE.

## Data Flow

- **In:** order request (depot, fuel type, quantity, optional lead time).
- **Compute:** sim countdown → delivery.
- **Out:** persisted `buy_orders`; `fuel_stocks.quantity_liters` increased on delivery;
  `buy_order_update` WS frame consumed by 29-of8-supply-ui.

## Dependencies

- **24-fuel-supply-model** — `SupplyProvider` (`adjust_stock`, `get_depot`, `get_stock`).
- **14-sim-engine** — the tick that advances the countdown and triggers delivery.

## Security

Server-authoritative. Request body is typed (`quantity_liters >= 0`, `fuel_type` enum,
`lead_time_game_s >= 0`); FastAPI validates. No auth (single-user MVP).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
