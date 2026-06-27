---
id: 109-offroad-penalty-tuning
title: Explicit off-road fuel penalty
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-18
wave_status: complete
depends_on: []
relates: [107-offroad-no-route-straight-line, 17-tile-cost-model]
source_files:
  - backend/app/services/cost_model.py
  - backend/app/services/terrain_router.py
routes: []
models: []
test_files:
  - backend/tests/test_terrain_router.py
data_flow: reads-existing
last_synced: 2026-06-27
status: complete
phase: all
mdd_version: 11
tags: [routing, offroad, fuel, cost-model, penalty]
path: Routing/OffRoad
known_issues:
  - "Live-sim off-road traversal still uses speed_road_kph regardless of mode (mode not persisted on the order) — pre-existing W10 known issue in TODO.md; this feature only tunes the planner-side off-road cost."
---

# 109 — Explicit off-road fuel penalty

## Why

"Getting off roads should have speed and fuel penalties — is this implemented?" Investigation:
the **speed** penalty already exists and is meaningful (each unit's `speed_offroad_kph` ≈ half
`speed_road_kph`, applied by the planner for off-road/direct modes). The **fuel** penalty was only
the terrain factor (1.0–1.4). This adds an explicit, centralized off-road fuel penalty.

## Fix

New tunable constant `OFFROAD_FUEL_PENALTY = 1.25` in `cost_model.py` (the single source of
truth). `terrain_router._terrain_factors` multiplies the off-road `fuel_factor` by it, so
cross-country movement is explicitly thirstier than the bare terrain factor. **Speed is not
penalized here** — that would double-count `speed_offroad_kph`; the comment documents the split.

## Test

`test_terrain_router.py::TestOffroadFuelPenalty`: `OFFROAD_FUEL_PENALTY > 1`; for OPEN terrain
(speed factor 1.0 → effective == distance) an off-road path's `fuel_distance_m` ==
`OFFROAD_FUEL_PENALTY × effective_distance_m`, and is strictly greater than the time-only cost.
