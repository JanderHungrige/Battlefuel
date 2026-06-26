---
id: battlefuel-v2-wave-18
title: "Wave 18: Road-routing fidelity — nearest-road snapping, straight stubs, off-road fallback"
initiative: battlefuel-v2
initiative_version: 11
status: planned
depends_on: battlefuel-v2-wave-17
demo_state: "Road routes look right and reach the actual closest road. The engine snaps the start and destination to the nearest POINT on the nearest road edge (not a far-away graph vertex), so routing no longer feels random; a straight dashed stub joins the unit to its first road point and the last road point to the target (when either is off-road); choosing off-road to an unreachable point draws a straight line instead of 'no route to that destination'; off-road carries a real speed + fuel penalty; and in ROAD mode SAFEST sticks to the road network until closest to the point (no surprise cross-country detour — that now belongs to Hybrid)."
created: 2026-06-26
hash: 277d04fb
---

# Wave 18: Road-routing fidelity

> **Requested 2026-06-26 (brain-dump batch).** Manual testing shows road routing snaps to a
> distant road node and renders with no connection to the unit/target, off-road sometimes fails
> outright, and "road + safest" wanders off-road. This wave makes road routing faithful to what
> the operator sees on the map.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — on `dev-deployment`, deployed to `:3001`, verified
- [ ] **merged into main / deployed in prod** — in `main`, live `:3000`

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | nearest-road-point-snap | — | planned | — |
| 2 | road-stub-geometry | — | planned | nearest-road-point-snap |
| 3 | offroad-no-route-straight-line | — | planned | — |
| 4 | road-safe-stick-to-roads | — | planned | — |
| 5 | offroad-penalty-tuning | — | planned | — |

Build order: 1 → 2; 3, 4, 5 independent.

### Current state (code investigation 2026-06-26)
- **Snap is to nearest VERTEX, not nearest point.** `app/providers/routing.py` `_PATH_SQL`
  snaps start/dest with `ways_vertices_pgr ORDER BY the_geom <-> ST_MakePoint(...) LIMIT 1` —
  the nearest road **intersection/endpoint node**, not the nearest point on the nearest edge.
  When that node is far, the route jumps to it → the "random / not the closest road" feel. The
  closest point on a road is never measured.
- **No start/end stubs.** The returned geometry is only the on-graph LineString between snapped
  vertices (`ST_MakeLine(geom ORDER BY seq)`); there is no segment from the unit's real position
  to the first road point, nor from the last road point to the destination.
- **Off-road can return None.** `TerrainRoutingProvider.shortest_path` → `terrain_path(...)` can
  yield `None` (disconnected), surfaced to the user as "no route". A straight-line router already
  exists: `DirectRoutingProvider` / `terrain_router.direct_path` (used by `direct` mode) — reuse
  it as the fallback.
- **Off-road penalty is implicit only.** Off-road uses `unit_type.movement.speed_offroad_kph`
  plus `cost_model.TERRAIN_FUEL` factors (forest 1.15 … wetland 1.30). There is no explicit extra
  "left the road" multiplier — F5 decides whether the implicit penalty is enough or needs a knob.
- **Road + SAFE deliberately detours off-road (Wave 16).** `route_planner.plan_routes`
  (`consider_offroad = ... or (metric is SAFE and mode is ROAD)`, lines ~120-139) makes ROAD-mode
  SAFE evaluate the off-road route and keep whichever is safer. **Decision 2026-06-26: reverse
  this for ROAD mode** — road means road.

### Feature notes (requester 2026-06-26)
- **F1 nearest-road-point-snap** — snap start/destination to the nearest **point on the nearest
  edge** (e.g. `ST_ClosestPoint` / `ST_LineLocatePoint` against candidate `ways`), so the route
  begins/ends at the truly closest road, and the closest road to the **final** point is actually
  measured and considered in option selection. Keep the always-resolve fallback.
- **F2 road-stub-geometry** — when the unit and/or target is off the road, prepend/append a
  **straight stub**: unit → first road point, last road point → target. Stub distance/time/fuel
  use the off-road rate and fold into the route totals; render the stub portion **dashed**.
- **F3 offroad-no-route-straight-line** — when the off-road router returns no path, fall back to a
  **straight line** (reuse `direct_path`) instead of surfacing "no route to that destination".
- **F4 road-safe-stick-to-roads** — in ROAD mode, SAFE varies the route **within the road
  network** only; no automatic off-road detour. Off-road detours move to Hybrid (Wave 19).
- **F5 offroad-penalty-tuning** — verify the off-road speed+fuel penalty is meaningful; add an
  explicit off-road penalty factor to `cost_model` if the implicit terrain/speed cost is too weak.
  Keep the planner estimate and the live sim burn in agreement (single source of truth in
  `cost_model`).

## Open Research (resolve at plan-time)
- Exact PostGIS snap approach: nearest-edge closest-point vs splitting the edge at the snap point
  for a clean dijkstra entry; performance over the Hohenfels `ways` table.
- Whether the stub (F2) should also be a real graph edge or purely a render+cost overlay.
