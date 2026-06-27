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

## Snap-accuracy refinements (2026-06-27, requester re-test)

The first cut still picked the wrong road past a "threshold line". Three fixes:

- **Option 1 — rank by true metres, not degrees.** `the_geom <-> point` orders by raw lon/lat
  **degrees**, which is anisotropic at 49°N (1° lon ≈ 73 km vs 1° lat ≈ 111 km), so an east/west
  edge looked farther than a closer north/south one. Now: take the 20 nearest by the planar index
  (candidate pool — keeps the index), then re-rank by `ST_Distance(::geography)`. Applied to the
  withPoints snap **and** the vertex-snap fallback. Confirmed: point (11.86,49.23) snapped
  ~124 m → ~92 m.
- **Option 2 — choose the lowest-TOTAL-cost candidate, not just the nearest.** The single nearest
  edge can be a dead-end spur pointing away (the "goes the other direction then cuts direct"
  U-turn). `_CHOOSE_SQL` takes the 5 nearest edges at each end and uses **`pgr_withPointsCost`** to
  get the on-road cost of every candidate pair, then picks the pair minimising
  `route_cost + both stub lengths`. `_NEAREST_SQL` (Option 1) is the fallback. Confirmed on
  `_A→_B`: total 6464 m → 5880 m (a slightly farther snap for a much shorter road).
- **Option 3 — price the off-road stub realistically.** Stubs were folded in at road rate
  (factor 1.0), so a long stub to a far road was "too cheap". New `OFFROAD_STUB_SPEED_FACTOR`
  (0.5 — off-road ≈ half speed) makes a stub's **time** = length / 0.5 (~2×) in both the candidate
  selection and the route's `effective_distance`; fuel uses `OFFROAD_FUEL_PENALTY`. Raw
  `distance_m` stays the true metres travelled.

**Frac clamp:** snap fractions are clamped to `[0.001, 0.999]` — `pgr_withPoints` chokes on a point
sitting exactly on a vertex (fraction 0/1). Bind-param casts use `CAST(:x AS double precision)`
(the `:x::float8` form trips SQLAlchemy's param parser).

## Test

`test_routing.py::TestNearestPointSnapAndStubs` (DB): off-road endpoints get `road_entry`/
`road_exit`; geometry begins at the unit and ends at the destination; distance ≥ straight-line;
`effective` > `distance` (Option 3 stub time). `test_nearest_selector_uses_true_metres_not_degrees`
(Option 1: nearest snap ~92 m, not ~124 m). `test_route_cost_pick_is_never_longer_than_nearest`
(Option 2: route-cost total ≤ nearest total). The existing `TestPgRouting` / `TestResolveAlways`
suites still pass (now via withPoints + the unchanged fallbacks).
