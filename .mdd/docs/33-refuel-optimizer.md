---
id: 33-refuel-optimizer
title: Refuel Optimizer — OR-Tools Truck Assignment
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-6
wave_status: active
depends_on: [32-optimizer-foundation, 26-refuel-orders, 25-supply-stock-api, 04-unit-query-api]
relates: [36-advisor-ui]
source_files:
  - backend/app/services/refuel_assignment.py
  - backend/app/services/refuel_recommender.py
  - backend/app/api/advice_refuel.py
  - backend/app/main.py
routes:
  - GET /api/v1/advice/refuel-plan
models: []
test_files:
  - backend/tests/test_refuel_optimizer.py
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [refuel, optimizer, ortools, assignment, advice]
path: Advice/Refuel
integration_contracts: []
satisfies_contracts:
  - from: 26-refuel-orders
    function: "RefuelRecommender.recommend(unit, trucks)"
    when: "Register an OR-Tools recommender as 'ortools' in the Wave-5 factory — a drop-in for per-order recommendation, no caller changes."
    status: done
    verified_at: "backend/app/services/refuel_recommender.py:104"
  - from: 32-optimizer-foundation
    function: "AdviceResult / Recommendation"
    when: "The refuel-plan endpoint returns AdviceResult(kind=refuel) with rationale per pairing."
    status: done
    verified_at: "backend/app/api/advice_refuel.py:71"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 33 — Refuel Optimizer — OR-Tools Truck Assignment

## Purpose

Replace the Wave-5 `"nearest"` refuel placeholder with a cost-aware optimizer, and add a
**multi-unit refuel plan**: given several thirsty units and the available fuel trucks, use
**OR-Tools** to assign trucks to units minimizing total cost (distance + fuel-adequacy), each
pairing explained with a rationale.

## Architecture

```
services/refuel_assignment.py   refuel_cost() (pure) + assign_trucks() (OR-Tools SimpleLinearSumAssignment, dummy-padded)
services/refuel_recommender.py  + OrToolsRefuelRecommender registered as "ortools" (drop-in via the Wave-5 factory)
api/advice_refuel.py            GET /advice/refuel-plan → AdviceResult(kind=refuel); appends "refuel" to capabilities
```

**Seam consumption:** the per-order recommender is swapped by flipping
`settings.refuel_recommender = "ortools"` — `refuel_service`/API callers are unchanged (Wave-5
contract). The `OrToolsRefuelRecommender` looks up unit/truck capacities via
`build_unit_provider()` (sessionless) to compute fuel-adequacy, so it is genuinely smarter than
nearest even for a single unit (it routes the 1-unit case through the same assignment).

## Data Model

No tables. `assign_trucks` returns `[(unit_id, truck_id, cost)]`. The endpoint maps each pairing
to a `Recommendation(kind=refuel, target=unit_id, action={endpoint:"refuel-orders", unit_id},
score=cost, rationale=...)` — "apply" creates a refuel order, which (with `"ortools"` selected)
re-derives the same truck, keeping advice and execution consistent.

## API Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/v1/advice/refuel-plan` | `AdviceResult(kind=refuel)` — one recommendation per assigned thirsty unit |

## Business Rules

- **Cost** (`refuel_cost`, pure, tunable constants): `distance_km` + a **fuel-adequacy penalty**
  (if a truck can't cover the unit's deficit, penalty ∝ shortfall fraction). Lower = better.
- **Assignment** (`assign_trucks`, OR-Tools): square-padded `SimpleLinearSumAssignment` over a
  complete bipartite graph (units × trucks) with integer costs (×100); dummy nodes (high cost)
  make any size feasible — a unit matched to a dummy/incompatible truck is **unserved**. Only
  **fuel-type-compatible** truck arcs get real cost; incompatible/dummy get a large constant.
- **Thirsty units** for the plan = placed non-fuel units below capacity (telemetry known);
  **available trucks** = `FUEL_SUPPLY` instances with `current_fuel_liters > 0`.
- Deterministic: fixed inputs → fixed assignment (no clock/RNG).

## Data Flow

`unit_instances` (positions/fuel) + unit-type fuel metadata (04) → cost matrix → OR-Tools
assignment → `AdviceResult`. Consumed by 36 (advisor UI) and by per-order creation via the
`"ortools"` recommender.

## Dependencies

32 (advice domain), 26 (RefuelRecommender seam + refuel orders), 25/04 (supply + unit metadata).

## Security

Read-only compute over server-owned state; no external input. OR-Tools costs are clamped to
non-negative ints.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
