---
id: 61-hybrid-direct-routing-modes
title: Hybrid + Direct Routing Modes
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-10
wave_status: active
depends_on: [44-terrain-router, 12-route-planning-api, 60-never-stall-traversal-threat-crossing]
relates: [43-routing-bug-fix, 17-tile-cost-model]
source_files:
  - backend/app/domain/route.py
  - backend/app/services/terrain_router.py
  - backend/app/providers/routing.py
  - backend/app/services/route_planner.py
routes: []
models: []
test_files:
  - backend/tests/test_terrain_router.py
  - backend/tests/test_route_planner.py
data_flow: reads-existing
last_synced: 2026-06-04
status: complete
phase: all
mdd_version: 11
tags: [routing, terrain, offroad, hybrid, direct, route-planning]
path: Routing/Engine
integration_contracts:
  - for: routing-mode-multi-route-ui
    function: "RouteMode = road | offroad | hybrid | direct on /routes/plan + /move-orders"
    when: "operator picks a travel mode in the planning UI"
satisfies_contracts: []
known_issues:
  - "Live-sim base speed: the sim traverses every order at speed_road_kph × tile factor regardless of mode (pre-existing W1 behaviour). The off-road/direct penalty is reflected in the PLANNED option (offroad speed + terrain fuel) but not yet in live traversal — persisting `mode` on the order + mode-aware sim speed is a follow-up (TODO.md)."
  - "Hybrid is modality-selecting (per metric, the cheaper of the road route vs the cross-country route). True edge-level fusion (a single path that weaves on/off road within one route) is a future enhancement."
---

# 61 — Hybrid + Direct Routing Modes

## Purpose

Roads-only routing is unrealistic on a battlefield and leaves a unit stuck when the only road
crosses a threat sector. This surfaces the existing off-road terrain router and adds two new
travel modes — **hybrid** (use roads where they win, cut cross-country where that's better,
especially to dodge threat) and **direct** (a near-straight cross-country line) — so the
operator can choose how a unit moves. Off-road and direct carry a realistic speed + fuel penalty.

## Architecture

`RouteMode` gains `HYBRID` and `DIRECT` alongside `ROAD` and `OFFROAD`. Selection happens in
`route_planner.plan_routes`:

```
ROAD     → pgRouting road provider              @ speed_road_kph     (existing)
OFFROAD  → terrain A* provider                  @ speed_offroad_kph  (existing, now surfaced)
DIRECT   → straight H3-line terrain provider     @ speed_offroad_kph  (new)
HYBRID   → per metric, the cheaper of {road option, off-road option} (new)
```

- **DIRECT**: `terrain_router.direct_path()` draws a **straight line between the exact start (unit
  centre) and exact destination (clicked point)** — the geometry is the two real endpoints, not
  snapped hex centres — with time/fuel/threat cost taken from the terrain of the cells the line
  crosses. Wrapped by `DirectRoutingProvider`. (Endpoint-exactness fix, 2026-06-04.)
- **Exact endpoints (both cross-country modes):** `terrain_path` (off-road) anchors its
  geometry's first/last points to the exact unit position and clicked point too — the
  intermediate path still follows terrain cell-by-cell, but the route no longer visibly snaps to
  the coarse H3 grid at its ends.
- **HYBRID**: `plan_routes` computes the road option (road provider @ road speed) and the
  off-road option (terrain provider @ off-road speed) for each metric and returns the better one
  (FAST → lower duration; SAFE → lower threat, then lower duration). This makes a SAFE-hybrid
  route go cross-country to avoid a threatened road, while FAST-hybrid keeps the fast road.

All modes return the same `RouteOption` shape, so the API, sim, and frontend are unchanged
beyond accepting the two new `mode` values.

## API

No new routes. The existing `mode: RouteMode` on `POST /api/v1/routes/plan` and
`POST /api/v1/move-orders` now also accepts `"hybrid"` and `"direct"`.

## Business Rules

1. Off-road and direct use `speed_offroad_kph` and terrain fuel factors → a built-in
   speed + fuel penalty vs. road travel.
2. `direct` never avoids threat or obstacles — it is the straight-line option; the operator
   chooses it knowingly. `offroad`/`hybrid` SAFE still threat-weight their search.
3. `hybrid` returns a real route whenever either modality resolves; if the road route is
   degraded/blocked and cross-country is cheaper, hybrid yields the cross-country path.
4. Determinism: terrain/direct routing is pure over an injected tile map (no DB, no RNG).

## Data Flow

`RouteMode` (request) → `plan_routes` selects provider(s) + speed → `RoutePath` (geometry +
distance + terrain-aware effective/fuel + threat) → `build_option` layers duration/fuel →
`RouteOption[]` → API → frontend (F4 renders the mode choice + resulting routes).

## Dependencies

- **44-terrain-router** — the off-road A* + `RoutePath` shape that direct/hybrid reuse.
- **12-route-planning-api** — `plan_routes` + `build_option`, extended here.
- **60-never-stall-traversal-threat-crossing** — built immediately before; F2 gives a SAFE
  reroute real cross-country options to route *around* a halt.

## Security

No external input beyond the existing typed `mode` enum (invalid values are rejected by
FastAPI/pydantic). No new storage, processes, or network calls.

## Known Issues

See frontmatter `known_issues` (sim base-speed-by-mode follow-up; modality-selecting hybrid).

## Bugs

(none yet)
