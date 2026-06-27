---
id: 108-road-safe-stick-to-roads
title: ROAD-mode SAFE sticks to the road network
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-18
wave_status: complete
depends_on: []
relates: [82-enemy-avoidance-cost, 83-safe-offroad-detour]
source_files:
  - backend/app/services/route_planner.py
routes: []
models: []
test_files:
  - backend/tests/test_route_planner.py
data_flow: reads-existing
last_synced: 2026-06-27
status: complete
phase: all
mdd_version: 11
tags: [routing, road, safe, fast, hybrid]
path: Routing/Road
---

# 108 — ROAD-mode SAFE sticks to the road network

## Why

v2 Wave 16 (doc 83) made ROAD-mode SAFE *also* evaluate the off-road route and keep whichever was
safer, so "road + safest" wandered cross-country. The requester wants **road to mean road**:
SAFE should stay on the road network until closest to the point. (Decision 2026-06-26.)

## Fix

In `route_planner.plan_routes`, `consider_offroad` is now `mode is RouteMode.HYBRID` only — the
`or (metric is SAFE and mode is ROAD)` clause is removed. ROAD mode runs both metrics purely on
the road provider; **off-road detours move to HYBRID** (which still does best-of-both via
`pick_route_option`). FAST road behaviour is unchanged.

## Test

`test_route_planner.py::TestRoadSafeSticksToRoads`: with a safer off-road option available, ROAD
mode keeps the road geometry for both metrics (SAFE does **not** detour); the same inputs in
HYBRID mode still take the safer off-road route for SAFE. The Wave-16 `TestSafeAutoDetour` class
was rewritten to this contract.
