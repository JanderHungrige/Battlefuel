---
id: 105-nearest-road-point-snap
title: Snap routing to the nearest point on the nearest road
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-18
wave_status: complete
depends_on: []
relates: [106-road-stub-geometry, 43-routing-bug-fix]
source_files:
  - backend/app/providers/routing.py
  - backend/app/domain/route.py
routes: []
models: []
test_files:
  - backend/tests/test_routing.py
data_flow: reads-existing
last_synced: 2026-06-27
status: complete
phase: all
mdd_version: 11
tags: [routing, pgrouting, withpoints, snap, postgis]
path: Routing/Road
---

# 105 — Snap routing to the nearest point on the nearest road

## Why

`_PATH_SQL` snapped start/dest to the nearest graph **vertex** (`ways_vertices_pgr <-> point`) —
a road intersection/endpoint that can be far away, so routes jumped to a "random"-looking distant
node and the *closest road to the destination was never measured*. (Requester: "Is the closest
point on a road measured to the final point?")

## Fix

New `_WITHPOINTS_SQL` uses **`pgr_withPoints`** (pgRouting 3.8) to route from the true closest
**point on the nearest edge**: `ST_LineLocatePoint` gives the fraction, the point is placed on
that edge, and the on-road geometry is reconstructed — the two terminal edges clipped at the snap
fraction with `ST_LineSubstring` (oriented by the traversal node), middle edges oriented by node.
The snapped points are returned as `RoutePath.road_entry` / `road_exit`.

**Gotcha:** `pgr_withPoints` needs **positive** pids in `points_sql` (1, 2), referenced as
**negative** in the start/end args (-1, -2).

**Robustness:** the start/dest edges are chosen from the same blocked-/obstacle-filtered metric
edge set as `:edges`. `shortest_path` tries withPoints first (in a SAVEPOINT so a failure can't
poison the caller's transaction), then falls back to the legacy vertex-snap dijkstra, then the
full-graph distance fallback — so routing is never *less* robust than before. Identical start/dest
returns `None` (unchanged).

## Test

`test_routing.py::TestNearestPointSnapAndStubs` (DB): off-road endpoints get `road_entry`/
`road_exit`; geometry begins at the unit and ends at the destination; distance ≥ straight-line.
The existing `TestPgRouting` / `TestResolveAlways` suites still pass (now via withPoints + the
unchanged fallbacks).
