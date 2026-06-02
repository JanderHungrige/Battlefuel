---
id: 34-redistribution-optimizer
title: Redistribution Optimizer — OR-Tools Min-Cost Flow
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-6
wave_status: active
depends_on: [32-optimizer-foundation, 24-fuel-supply-model, 25-supply-stock-api, 27-buy-orders]
relates: [36-advisor-ui]
source_files:
  - backend/app/services/redistribution.py
  - backend/app/api/advice_redistribution.py
  - backend/app/main.py
routes:
  - GET /api/v1/advice/redistribution
models: []
test_files:
  - backend/tests/test_redistribution.py
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [redistribution, optimizer, ortools, min-cost-flow, supply, advice]
path: Advice/Redistribution
integration_contracts: []
satisfies_contracts:
  - from: 32-optimizer-foundation
    function: "AdviceResult / Recommendation"
    when: "The redistribution endpoint returns AdviceResult(kind=redistribution) with a rationale per move."
    status: done
    verified_at: "backend/app/api/advice_redistribution.py:71"
  - from: 24-fuel-supply-model
    function: "build_supply_provider(settings)"
    when: "Depot/stock read for the plan goes through the factory."
    status: done
    verified_at: "backend/app/api/advice_redistribution.py:26"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 34 — Redistribution Optimizer — OR-Tools Min-Cost Flow

## Purpose

Balance fuel across depots. Per fuel type, depots above a target fill are **sources**, below are
**sinks**; **OR-Tools min-cost flow** computes the cheapest (distance-weighted) set of transfers,
and any deficit no depot can cover becomes a **buy** recommendation. Each move carries a rationale.

## Architecture

```
services/redistribution.py        redistribution_plan() — OR-Tools SimpleMinCostFlow per fuel type
api/advice_redistribution.py       GET /advice/redistribution → AdviceResult(kind=redistribution)
main.py                            mount; appends "redistribution" to capabilities
```

## Data Model

No tables. `redistribution_plan(depots, stocks, target_fraction)` returns `RedistributionMove`s:
- `transfer` — `{from_depot, to_depot, fuel_type, liters, cost}` (advisory; no order type exists
  for depot→depot transfer, so it is **display-only**, not applyable).
- `buy` — `{to_depot, fuel_type, liters, cost}` mapped to a **buy order** (applyable).

## API Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/v1/advice/redistribution` | `AdviceResult(kind=redistribution)` |

Each move → `Recommendation(kind=redistribution, target=<to_depot>, action, score=cost,
rationale)`. `transfer` moves carry an informational `action` (no `endpoint` → UI shows no
"apply"); `buy` moves carry `action={endpoint:"buy-orders", depot_id, fuel_type, quantity_liters}`.

## Business Rules

- **Target:** per (depot, fuel-type), `target = target_fraction * capacity` (default 0.5).
  `surplus = quantity − target` (>0 → source); `deficit = target − quantity` (>0 → sink).
- **Solver** (`SimpleMinCostFlow`, per fuel type): source→sink arcs cost = inter-depot distance
  (km, int); a **dummy node** balances supply/demand — leftover surplus flows to a 0-cost dummy
  sink (no transfer), and when demand exceeds surplus a dummy **source** (high unit cost so real
  transfers win) supplies the shortfall, surfaced as **buy** moves. Liters are integers; moves < 1 L
  are dropped.
- Deterministic (no clock/RNG). Read-only over `SupplyProvider`.

## Data Flow

`fuel_depots` + `fuel_stocks` (24/25) → per-fuel-type cost matrix → OR-Tools flow → transfers +
buys → `AdviceResult`. Consumed by 36 (advisor UI); buy moves "apply" via 27.

## Dependencies

32 (advice domain), 24/25 (depots + stock via the factory), 27 (buy-orders for "apply").

## Security

Read-only compute over server-owned supply state; no external input. Costs/liters clamped to
non-negative ints.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
