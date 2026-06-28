---
id: 111-hybrid-direct-shortcut
title: Hybrid takes a direct straight line when it beats the road composition
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-19
wave_status: active
depends_on: [110-segmented-hybrid-router]
relates: [110-segmented-hybrid-router]
source_files:
  - backend/app/providers/routing.py
  - backend/app/services/route_planner.py
routes: []
models: []
test_files:
  - backend/tests/test_route_planner.py
data_flow: reads-existing
last_synced: 2026-06-28
status: complete
phase: all
mdd_version: 11
tags: [routing, hybrid, direct, shortcut]
path: Routing/Hybrid
---

# 111 — Hybrid direct shortcut

## Why

On a short leg, going out to a road and back can be slower than a clean straight cross-country
line. Hybrid should evaluate the direct route too and take it when it wins.

## Fix

`HybridRoutingProvider.shortest_path` now also computes `direct_path` and returns the better of
`{hybrid, direct}` via the new `route_planner.pick_better_path(metric, *paths)` — FAST → lowest
`effective_distance`; SAFE → lowest `threat_max`, then `effective`.

**Fair comparison (the subtle bit):** the hybrid A* already slows off-road cells by
`OFFROAD_STUB_SPEED_FACTOR` (0.5), so its `effective_distance` is road-speed-equivalent. `direct`'s
`effective` is at bare terrain speed (no off-road slowdown) — in open terrain that's the *same* as
road speed, so an un-adjusted direct would look as fast as a road and **always win** (the original
"hybrid == direct" bug). So before comparing, direct's `effective` is divided by
`OFFROAD_STUB_SPEED_FACTOR` to put it on the same off-road footing. Result: long routes keep hugging
roads (A→B stays the 208-pt road line), and direct only wins when the straight off-road line is
genuinely better on a short leg.

## Test

`test_route_planner.py::TestPickBetterPath`: FAST picks lowest effective; SAFE prefers lower
threat_max even if longer; `None` candidates skipped. Live-verified: A→B (long) still returns the
road-hugging hybrid, not the direct line.
