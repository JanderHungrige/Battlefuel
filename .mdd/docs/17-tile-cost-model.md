---
id: 17-tile-cost-model
title: Tile Cost Model
edition: MDD
depends_on: [11-routing-graph, 12-route-planning-api, 14-sim-engine, 07-hex-tile-model-api, 01-unit-stats-model]
relates: [18-dynamic-tile-updates, 14-sim-engine]
source_files:
  - backend/app/services/cost_model.py
  - backend/app/services/routing_graph.py
  - backend/app/providers/routing.py
  - backend/app/domain/route.py
  - backend/app/services/route_planner.py
  - backend/app/services/sim.py
  - backend/app/services/sim_runner.py
routes: []
models: []
test_files:
  - backend/tests/test_cost_model.py
  - backend/tests/test_route_planner.py
  - backend/tests/test_sim.py
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [routing, pgrouting, cost-model, terrain, threat, fuel, simulation]
path: Routing/Cost
integration_contracts:
  - function: "cost_model.tile_factors / edge_time_cost / safe_edge_cost"
    when: "any consumer that turns tile attributes into speed/fuel/route cost"
    note: "single source of truth — routing annotation, planner, and sim must all use it"
satisfies_contracts: []
security_read_sites: []
known_issues: []
---

# 17 — Tile Cost Model

## Purpose
One pure cost model that turns tile attributes (terrain, road_condition, threat) into a
per-tile **speed_factor** and **fuel_factor** plus the threat weighting of the "safe" route
cost. Routing-graph annotation, the route planner, and the live sim all consume it, so the
planner's "fuel on arrival" matches what the sim actually burns, and terrain/threat finally
affect movement (Wave 3 wired the hooks but terrain was cosmetic and threat ~zero).

## Architecture
`services/cost_model.py` (pure, no I/O) holds the tunable factor tables and three functions:
`tile_factors(terrain, road) → TileFactors(speed_factor, fuel_factor)`,
`edge_time_cost(length_m, factors)` (a **time-proxy** cost = `length / speed_factor`), and
`safe_edge_cost(time_cost, threat_level)`. Consumers:

- **routing_graph.annotate_ways** — per edge, resolve its tile, compute `time_cost`,
  `safe_cost`, and store `speed_factor`/`fuel_factor`/`time_cost`/`safe_cost` columns on `ways`
  (added via `ALTER … IF NOT EXISTS`, matching the Wave 3 pattern). Blocked roads get a huge
  sentinel cost so the router treats them as impassable.
- **providers/routing (PgRoutingProvider)** — FAST now minimizes `time_cost` (terrain-aware),
  SAFE minimizes `safe_cost`; blocked edges are filtered out of the graph. The query also sums
  `effective_distance_m = Σ time_cost` and `fuel_distance_m = Σ fuel_factor·time_cost` over the
  path so estimates are exact.
- **route_planner.build_option** — duration from `effective_distance_m`, fuel from
  `fuel_distance_m` (falls back to real distance if a path predates annotation).
- **sim.advance / sim_runner** — each tick looks up the unit's current tile and applies the
  same `speed_factor`/`fuel_factor` to live speed and burn.

```
tile (terrain, road, threat) ─ cost_model ─┬─ annotate_ways → ways.time_cost / safe_cost / factors
                                           ├─ planner: duration & fuel from path sums
                                           └─ sim: per-tick speed_factor / fuel_factor
```

## Data Model
No new tables. New `ways` columns (runtime `ALTER … IF NOT EXISTS`): `speed_factor`,
`fuel_factor` (double, default 1.0), `time_cost`, `time_reverse_cost` (double). `RoutePath`
gains `effective_distance_m` and `fuel_distance_m` (default 0 → planner falls back to
`distance_m`).

### Factor tables (tunable; defaults approved at planning)
| terrain | speed | fuel | | road | speed | fuel |
|---|---|---|---|---|---|---|
| open | 1.00 | 1.00 | | clear | 1.00 | 1.00 |
| farmland | 0.95 | 1.05 | | damaged | 0.50 | 1.30 |
| military | 0.90 | 1.05 | | blocked | 0.00 (impassable) | 1.00 |
| forest | 0.80 | 1.15 |
| urban | 0.70 | 1.20 |
| wetland | 0.60 | 1.30 |
| water | 0.50 | 1.40 |
| unknown | 1.00 | 1.00 |

Combined multiplicatively (terrain × road). `threat_weight = 5.0`:
`safe_cost = time_cost × (1 + 5·threat_level)`.

## API Endpoints
None new. Existing `POST /routes/plan` now returns terrain/threat-aware duration & fuel.

## Business Rules
- `speed_factor = 0` (blocked road) ⇒ edge is impassable: excluded from the routing graph; in
  the sim the unit makes no progress that tick (still burns fuel — stuck).
- FAST minimizes time-proxy cost (so it avoids slow terrain / damaged roads), SAFE adds threat.
- Planner estimate and sim burn use the **same** factor tables ⇒ they agree (modulo tick
  granularity).
- `unknown` terrain and missing tiles ⇒ neutral factors (1.0, 1.0).

## Data Flow
See `.mdd/audits/flow-tile-cost-model-2026-06-01.md` (reads tiles + ways; no new external input).

## Dependencies
- **11-routing-graph** (annotation + `ways`), **12-route-planning-api** (planner),
  **14-sim-engine** (sim advance), **07-hex-tile-model-api** (tile attributes),
  **01-unit-stats-model** (speed/consumption fields).

## Security
No new external input surface. Pure model + DB reads of existing tables. Single-user,
server-authoritative.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
