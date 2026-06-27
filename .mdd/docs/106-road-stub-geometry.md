---
id: 106-road-stub-geometry
title: Straight stubs from the unit to the road and from the road to the target
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-18
wave_status: complete
depends_on: [105-nearest-road-point-snap]
relates: [105-nearest-road-point-snap]
source_files:
  - backend/app/providers/routing.py
  - backend/app/domain/route.py
  - backend/app/services/route_planner.py
  - frontend/src/api/types.ts
routes: []
models: []
test_files:
  - backend/tests/test_routing.py
data_flow: reads-existing
last_synced: 2026-06-27
status: complete
phase: all
mdd_version: 11
tags: [routing, road, stub, geometry, dashed]
path: Routing/Road
known_issues:
  - "Dashed STYLING of the stub segments in MapView is the remaining polish: road_entry/road_exit now flow to the frontend RouteOption, but the dashed line layer is verified/finished at the live make dev/:3001 gate (jsdom mocks MapView, per repo convention). The geometry already connects unit→road→dest as a solid line."
---

# 106 — Straight stubs from the unit to the road and from the road to the target

## Why

In road mode the returned geometry was only the on-graph line between snapped nodes, so it didn't
connect to the unit's actual position or to the off-road target — the route "floated". Requester:
"draw a straight route to this first point" (and from the last road point to the target).

## Fix

Building on F1's true entry/exit points, `_WITHPOINTS_SQL` assembles the final geometry as
`ST_MakeLine(ARRAY[unit_point, on_road_line, dest_point])` — a straight stub from the unit to the
road entry point and from the road exit point to the destination. The two stub lengths
(`ST_Distance` geography) fold into `distance_m`, `effective_distance_m`, and `fuel_distance_m`
(the off-road *speed* slowdown of the short stub is approximated at factor 1.0 — negligible for a
near-road unit; off-road fuel is covered by doc 109 on the terrain path).

`road_entry` / `road_exit` are carried `RoutePath → RouteOption → frontend RouteOption` so the UI
can dash the `geometry[0]→road_entry` and `road_exit→geometry[-1]` stub segments.

## Test

`test_routing.py::TestNearestPointSnapAndStubs` (DB): geometry starts exactly at the unit and ends
exactly at the destination, `road_entry` differs from the unit (a real stub), distance ≥
straight-line. Dashed stub *styling* is finished at the live gate (MapView is jsdom-mocked).
