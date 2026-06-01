---
id: 26-refuel-orders
title: Refuel Orders — Co-located Transfer & Pluggable Recommender
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [24-fuel-supply-model, 08-unit-instances, 04-unit-query-api, 14-sim-engine, 13-move-orders]
relates: [27-buy-orders, 29-of8-supply-ui]
source_files:
  - backend/app/domain/refuel.py
  - backend/app/models/refuel_order.py
  - backend/app/providers/refuel_orders.py
  - backend/app/services/refuel_recommender.py
  - backend/app/services/refuel_service.py
  - backend/app/api/refuel_orders.py
  - backend/app/providers/unit_instances.py
  - backend/app/services/sim_runner.py
  - backend/app/config.py
  - backend/app/main.py
  - backend/alembic/versions/0009_create_refuel_orders.py
routes:
  - POST /api/v1/refuel-orders
  - POST /api/v1/refuel-orders/{order_id}/confirm
  - POST /api/v1/refuel-orders/{order_id}/cancel
  - GET /api/v1/refuel-orders
  - GET /api/v1/refuel-orders/{order_id}
models:
  - refuel_orders
  - unit_instances
test_files:
  - backend/tests/test_refuel_orders.py
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [refuel, supply, orders, recommender, sim, factory, optimization-seam]
path: Supply/Refuel
integration_contracts:
  - function: "RefuelRecommender.recommend(unit, trucks)"
    when: "Wave 6 adds an OR-Tools RefuelRecommender as a NEW registered implementation (settings.refuel_recommender) — never by editing the nearest placeholder. Callers depend only on the interface and the RefuelRecommendation return type."
    consumers: []
satisfies_contracts: []   # refuel transfers from a truck (UnitInstance), not depot stock — 24's supply-provider contract does not apply here
known_issues: []
security_read_sites: []
sister_projects: []
---

# 26 — Refuel Orders — Co-located Transfer & Pluggable Recommender

## Purpose

Let the operator order a thirsty unit refuelled from a mobile fuel truck. Fuel transfers
**only when the unit and the assigned truck occupy the same hex** — the operator drives the
truck there manually (Wave-3 move orders). On creation, a **pluggable recommender** suggests
the closest compatible fuel truck and a rendezvous; the real optimization algorithm is
deferred to Wave 6 and drops in as a new recommender implementation without changing callers.

## Architecture

```
domain/refuel.py            RefuelOrder(+Status), Rendezvous, RefuelRecommendation
models/refuel_order.py      RefuelOrderRow
providers/refuel_orders.py  RefuelOrderProvider(ABC)→Db; build_refuel_order_provider()
services/refuel_recommender.py  RefuelRecommender(ABC)→NearestRefuelRecommender;
                                 build_refuel_recommender()  ← Wave-6 swap point
services/refuel_service.py  create_refuel_order(); compute_transfer()/co_located() (pure);
                            try_complete_refuel()
api/refuel_orders.py        POST/GET endpoints
sim_runner.py               complete_refuels() — checks co-location each tick, transfers
providers/unit_instances.py set_fuel() — provider mutation path for instance fuel
```

**Recommender seam.** `RefuelRecommender` is registered in a factory and selected by
`settings.refuel_recommender` (`"nearest"` ships now). The return type
`RefuelRecommendation` (`truck_id`, `rendezvous`, optional `score`/`rationale`) is **stable**:
the Wave-6 OR-Tools optimizer fills `score`/`rationale`; the nearest placeholder leaves them
`None`. The interface takes `(unit, trucks)` — richer context (depots, sim clock) an optimizer
needs is injected through its constructor, so the method signature never changes.

## Data Model

**`refuel_orders`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | String, PK | uuid4 hex |
| `unit_id` | String | The thirsty unit (instance id) |
| `truck_id` | String | Assigned fuel truck (instance id) from the recommendation |
| `fuel_type` | String | `FuelType` of the unit being refuelled |
| `status` | String | `pending` → `active` → `complete` / `cancelled` |
| `rendezvous_lat` / `rendezvous_lon` | Float | Suggested meeting point |
| `rendezvous_h3` | String | Meeting cell |
| `requested_liters` | Float, nullable | `None` = fill to capacity |
| `transferred_liters` | Float | Set on completion (default 0) |
| `created_at` | DateTime | server default now |

Index `ix_refuel_orders_status`. A fuel truck is a placed `UnitInstance` of a `FUEL_SUPPLY`
unit type; its carried fuel is `current_fuel_liters`.

## API Endpoints

| Method | Path | Body / Result |
|--------|------|---------------|
| POST | `/api/v1/refuel-orders` | `{unit_id, requested_liters?}` → `RefuelOrder` (201). 404 unknown unit; 409 unit type missing; 422 no compatible fuel truck available |
| POST | `/api/v1/refuel-orders/{id}/confirm` | → `RefuelOrder` (status `active`) |
| POST | `/api/v1/refuel-orders/{id}/cancel` | → `RefuelOrder` (status `cancelled`) |
| GET | `/api/v1/refuel-orders` | `list[RefuelOrder]` |
| GET | `/api/v1/refuel-orders/{id}` | `RefuelOrder` (404 if unknown) |

## Business Rules

- **Recommendation on create.** The service gathers candidate trucks — placed instances of a
  `FUEL_SUPPLY` type, **matching fuel type**, with `current_fuel_liters > 0`, excluding the unit
  itself — and calls the recommender. No candidate ⇒ 422. The recommender does **not** dispatch
  the truck; the operator moves it.
- **Transfer is co-location-gated.** `try_complete_refuel` runs from the sim tick for `active`
  orders: if unit and truck share an H3 cell, it transfers
  `compute_transfer(unit_fuel, unit_capacity, truck_fuel, requested_liters)` litres — clamped to
  unit headroom and available truck fuel — via `set_fuel` on both instances, marks the order
  `complete` with `transferred_liters`, and broadcasts a `refuel_order_update` frame.
- **Pure transfer math.** `compute_transfer` and `co_located` are pure functions (deterministic
  unit tests, no DB).
- Missing-telemetry unit (`current_fuel_liters is None`) is treated as 0 for headroom (documented
  simplification).

## Data Flow

- **In:** `unit_instances` (unit + trucks, position + fuel), unit-type fuel metadata (04).
- **Compute:** recommender selects truck + rendezvous; sim checks co-location and transfers.
- **Out:** persisted `refuel_orders`; mutated `unit_instances.current_fuel_liters`;
  `refuel_order_update` WS frame consumed by 29-of8-supply-ui.

## Dependencies

24 (supply provider), 08 (instances + `set_fuel`), 04 (unit-type fuel), 14 (sim tick hook),
13 (operator moves the truck via move orders).

## Security

Server-authoritative game state. Request body is small and typed (`unit_id`,
`requested_liters >= 0`); FastAPI validates. No auth (single-user MVP).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
