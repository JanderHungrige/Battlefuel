---
id: 107-offroad-no-route-straight-line
title: Off-road "no route" falls back to a straight line
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-18
wave_status: complete
depends_on: []
relates: [106-road-stub-geometry, 109-offroad-penalty-tuning]
source_files:
  - backend/app/services/terrain_router.py
  - backend/app/providers/routing.py
routes: []
models: []
test_files:
  - backend/tests/test_terrain_router.py
data_flow: reads-existing
last_synced: 2026-06-27
status: complete
phase: all
mdd_version: 11
tags: [routing, offroad, terrain, fallback, straight-line]
path: Routing/OffRoad
---

# 107 — Off-road "no route" falls back to a straight line

## Why

Choosing off-road to a destination the terrain A* can't reach surfaced "no route to that
destination". The requester wants a straight line drawn instead.

## Fix

New pure helper `terrain_or_direct(tiles, …)` in `terrain_router.py`: tries `terrain_path` (A*),
and when that returns `None` falls back to `direct_path` (the existing straight-line router),
flagging the result `degraded=True`. Returns `None` only when even a straight line is impossible
(no tiles / identical points). `TerrainRoutingProvider.shortest_path` now calls
`terrain_or_direct` instead of `terrain_path`, so every off-road consumer (plan, waypoint, fuel
run) gets the fallback.

## Test

`test_terrain_router.py::TestTerrainOrDirect`: returns the real A* path when one exists
(`degraded` False); on a disconnected 2-cell map (A* fails) returns the straight line flagged
`degraded` with the exact endpoint geometry; returns `None` only for an empty theater.
