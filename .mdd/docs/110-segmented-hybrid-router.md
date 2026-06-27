---
id: 110-segmented-hybrid-router
title: Segmented hybrid router — road-aware A* (follow roads, cut cross-country)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-19
wave_status: active
depends_on: []
relates: [111-hybrid-direct-shortcut, 112-hybrid-route-segment-ui, 61-hybrid-direct-routing-modes]
source_files:
  - backend/app/services/terrain_router.py
  - backend/app/providers/routing.py
  - backend/app/services/route_planner.py
routes: []
models: []
test_files:
  - backend/tests/test_terrain_router.py
  - backend/tests/test_route_planner.py
data_flow: reads-existing
last_synced: 2026-06-27
status: complete
phase: all
mdd_version: 11
tags: [routing, hybrid, terrain, astar, roads, segmented]
path: Routing/Hybrid
known_issues:
  - "Geometry is hex-centre granularity (coarser than the pure-road geometry). Conveys the road-vs-shortcut shape; smoother true-road geometry for road segments is a possible follow-up if the hex path looks too jagged at the live gate."
---

# 110 — Segmented hybrid router (road-aware A*)

## Why

Hybrid was a **whole-route pick** (`pick_route_option`): compute the whole road route and the whole
off-road route, return whichever wins. In open terrain the off-road A* is nearly straight, so hybrid
collapsed onto a near-direct line and **ignored roads running right beside the route** (requester:
"hybrid is 99% the same as direct"). Root cause: in open terrain `TERRAIN_SPEED = 1.0`, so off-road
is as cheap as a road in the cell cost — nothing pulls the route onto roads.

## Fix

One **road-aware A\*** over the H3 grid (`terrain_router.hybrid_path`):
- A cell carrying a road costs **road speed** (factor 1.0); an off-road cell costs terrain speed ×
  `OFFROAD_STUB_SPEED_FACTOR` (0.5) and the off-road fuel penalty. So roads are genuinely preferred,
  the route **cuts cross-country only where a shortcut beats the road** despite the penalty, and on
  **SAFE** the threat weighting makes it **leave the road just to skirt high-threat cells** then
  rejoin.
- The `A*` (`_a_star`/`_step_cost`/`_cost_over_cells`) was refactored to take a `FactorsFn`
  `(terrain, cell) -> TileFactors`; pure off-road passes `_terrain_only`, hybrid passes
  `_hybrid_factors(roads)`. Off-road/direct behaviour is unchanged.
- `HybridRoutingProvider` loads the theater tiles (+ enemy-proximity threat, as the terrain router
  does) and the road-cell set (`SELECT DISTINCT cell_h3 FROM ways`), and calls `hybrid_path`.
  Registered as `"hybrid"`; `build_routing_provider_for_mode(HYBRID)` returns it.
- `plan_routes` no longer special-cases hybrid as a pick — HYBRID flows through the generic path to
  the provider, costed at **road speed** (its effective-distance is already road-speed-equivalent
  because off-road cells are inflated in the A* cost). The unused `offroad` param was removed.

Verified A→B: FAST = 4.6 km road-heavy (crosses threat for speed); SAFE = 12.5 km, detours off-road
to drop threat_max 5→2 and `effective > distance` (the off-road segments cost extra time).

## Test

`test_terrain_router.py::TestHybridPath`: road cells cost less time than off-road (same geometry,
lower `effective`); SAFE detours off a high-threat road cell (FAST crosses it). The old whole-route
hybrid-pick test was removed; `pick_route_option` remains a tested utility but is no longer used by
`plan_routes`.
