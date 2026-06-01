---
id: 35-movement-route-advisor
title: Movement & Route Advisor — Heuristic
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-6
wave_status: active
depends_on: [32-optimizer-foundation, 12-route-planning-api, 13-move-orders, 24-fuel-supply-model, 07-hex-tile-model-api]
relates: [36-advisor-ui]
source_files:
  - backend/app/services/movement_advisor.py
  - backend/app/api/advice_movement.py
  - backend/app/main.py
routes:
  - GET /api/v1/advice/route
  - GET /api/v1/advice/reposition
models: []
test_files:
  - backend/tests/test_movement_advisor.py
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [movement, route, reposition, advisor, heuristic, advice]
path: Advice/Movement
integration_contracts: []
satisfies_contracts:
  - from: 32-optimizer-foundation
    function: "AdviceResult / Recommendation"
    when: "Both endpoints return AdviceResult with a rationale per recommendation."
    status: done
    verified_at: "backend/app/api/advice_movement.py:96"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 35 — Movement & Route Advisor — Heuristic

## Purpose

Heuristic movement advice (no OR-Tools): (a) **route ranking** — for a unit + destination, rank
the planner's options by threat / fuel-sufficiency / time and recommend the best with a rationale;
(b) **reposition suggestions** — flag units worth moving (low fuel → nearest depot; high-threat
sector → nearest safe cell). Both are advisory; "apply" creates a move order.

## Architecture

```
services/movement_advisor.py   rank_routes() + reposition_suggestions() (pure)
api/advice_movement.py          GET /advice/route, GET /advice/reposition → AdviceResult
main.py                         mount; appends "route" + "reposition" to capabilities
```

Route ranking reuses the Wave-3 `plan_routes` (pgRouting). Reposition is a bounded heuristic over
unit fuel, the unit's current tile threat, depots, and tiles — explicitly **not** an optimizer
(full positioning optimization is deferred; see the wave's Open Research).

## Data Model

No tables. Pure helpers:
- `rank_routes(options) -> [(option, score, rationale)]` — score (lower=better) =
  `duration_min + threat_max·W_THREAT + (0 if sufficient_fuel else BIG)`.
- `reposition_suggestions(units, catalog, tiles, depots) -> [(unit_id, dest_lat, dest_lon, score, rationale)]`
  — per unit, at most one suggestion.

## API Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/v1/advice/route?instance_id&dest_lat&dest_lon` | `AdviceResult(kind=route)` — options ranked best-first (404 unknown unit; 409 missing type; 422 no route) |
| GET | `/api/v1/advice/reposition` | `AdviceResult(kind=reposition)` — units worth moving |

Each recommendation's `action = {endpoint:"move-orders", instance_id, dest_lat, dest_lon, metric}`,
so "apply" creates a move order.

## Business Rules

- **Route ranking:** insufficient-fuel options are pushed to the bottom (big penalty) but still
  shown (with an "INSUFFICIENT FUEL" rationale); ties broken by duration. The best option's
  `metric` is carried into the apply action.
- **Reposition heuristic** (one suggestion per unit, fuel rule wins over threat rule):
  - **Low fuel** — `current/capacity < 0.25` (telemetry known) → destination = **nearest depot**;
    rationale notes the fuel %.
  - **High-threat sector** — the unit's current tile `threat_level ≥ 3` → destination = **nearest
    tile with threat 0**; rationale notes the threat drop.
  - Fuel trucks and units with no telemetry / no rule hit are skipped.
- Score = distance (km) to the suggested destination (cost of the move); rationale carries the why.

## Data Flow

`unit_instances` + unit-type metadata + `tiles` + `fuel_depots` → heuristics → `AdviceResult`;
route ranking also calls the routing provider. Consumed by 36; "apply" → 13 (move orders).

## Dependencies

32 (advice domain), 12 (`plan_routes`), 13 (move orders for apply), 24 (depots), 07 (tiles).

## Security

Read-only compute; query params validated by FastAPI. No external write input.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
