---
id: battlefuel-v2-wave-1
title: "Wave 1: Routing Engine — Fix + Full Terrain (Off-Road) Router"
initiative: battlefuel-v2
initiative_version: 2
status: planned
depends_on: none
demo_state: "A unit reliably routes to a chosen destination and traverses it end-to-end — no 'no route to destination', no back-and-forth, no stall. AND units can move cross-country off-road (by foot) over the terrain grid with terrain-aware cost, not only on roads; both road and off-road routes return the same RouteOption shape (duration + fuel-on-arrival + threat) and the unit actually follows them in the live sim."
created: 2026-06-02
hash: e2631d66
---

# Wave 1: Routing Engine — Fix + Full Terrain (Off-Road) Router

## Demo-State
Order a unit to a destination → it **gets a valid route and drives/walks there**, smoothly,
without the current "no route", reverse-direction, or stall behaviour. Toggle the movement
mode and the unit can **cut across terrain off-road** (by foot) with realistic terrain cost.
*(Not complete until both can be demonstrated live via `make dev`.)*

## Scope
Two tightly-related pieces of the **same engine**, so they ship together (per the v2 decision):

1. **Fix the road router + sim traversal** — the live bug: routes often don't resolve
   ("never a route to that destination") and, when they do, units sometimes reverse or don't
   move. This is a **debug-first** task (audit → root-cause → fix → regression test).
2. **Add a full terrain (off-road / by-foot) router** — a new routing path over the H3/terrain
   grid with terrain cost + by-foot speed, behind the existing routing **factory** so it's a
   config/param-selectable provider that returns the same `RoutePath`/`RouteOption` shape — no
   changes required in `route_planner`, the sim, or order creation beyond mode selection.

**Out of scope (later waves):** the routing *UX* (Esc-to-exit, multiple-route display, manual
waypoints, on/off-road toggle in the UI, smaller visual ticks) is **Wave 6**; this wave makes
the engine correct and capable. A minimal API param (`mode=road|offroad`, default `road`) is
enough for Wave 1.

**Locked inputs:** Python/FastAPI, PostgreSQL+PostGIS+pgRouting, H3 hex grid + per-tile terrain
cost (Wave-4 cost model), factory-pattern providers, continuous real-time sim. Decision:
**full terrain router** (not an approximation).

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | routing-bug-fix      | — | planned | — |
| 2 | terrain-router       | — | planned | routing-bug-fix |

Build order: 1 → 2.

### Feature notes
- **routing-bug-fix** — Start with a **`/mdd bug` audit** of the road-routing path:
  `route_planner` → `RoutingProvider` (pgRouting) → `sim_runner` traversal. Likely root causes
  to bisect (form hypotheses, prove each):
  - **Graph connectivity**: the sim mutating tiles (block roads / raise threat) can disconnect
    `ways` / inflate `safe_cost` to unreachable, so `pgr_dijkstra` returns no path — the known
    dev-DB gotcha (re-annotate / reset `road_condition`). Decide whether routing should fall
    back to distance-cost when safe-cost is unreachable.
  - **Destination snapping**: nearest-vertex lookup for the clicked point/area too far or null.
  - **Sim traversal**: "moves back" / stall ⇒ a bug in how `sim_runner` advances along the
    path (segment ordering, start-vertex vs unit position, tick step sign).
  Deliver: a deterministic regression test (inject clock/positions) reproducing "no route" and
  "reverse/stall", then the fix. Document the root cause in the feature doc + a memory note.
- **terrain-router** — A new `RoutingProvider` implementation (e.g. `"terrain"` / `"hybrid"`)
  registered via the Wave-3 routing factory. **A\*** over the **H3 grid** (theater is ~146
  tiles — trivial perf): node = hex, edge = adjacent hex, cost = terrain `time_cost` + threat
  (reuse the Wave-4 tile cost model), speed = the unit's **off-road / by-foot** speed attribute.
  Emit the same `RoutePath` (geometry + `effective_distance_m` / `fuel_distance_m`) so
  `route_planner` layers duration + fuel unchanged, and `sim_runner` traverses it unchanged.
  Add `mode=road|offroad` to `plan_routes` + move-order creation (default `road`). Deterministic
  tests with fixed start/dest/terrain.

## Open Research
- **Root cause of "no route"** — connectivity vs snapping vs cost; confirm by reproducing
  against a fresh-seeded DB vs a sim-polluted DB. Decide the fallback (distance cost when
  safe-cost unreachable) so a route is *always* returned when one geometrically exists.
- **Hybrid vs pure off-road** — should `offroad` be pure cross-country, or a hybrid that uses
  roads where cheaper and cuts across terrain otherwise? (Wave 1: at least pure off-road; note
  hybrid as a possible extension.)
- **By-foot speed source** — which unit attribute drives off-road speed (existing
  offroad/combat speed fields) and how fuel burn differs off-road.
- **Start/180° snapping** — ensure the route starts in the unit's current direction/hex so the
  unit doesn't "reverse" out of its tile.
- **Tick granularity** — "smaller ticks" is a Wave-6 UX item, but verify the fix doesn't depend
  on tick size (the engine should be correct at any tick).
