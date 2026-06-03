---
id: battlefuel-v2-wave-10
title: "Wave 10: Routing & Movement Overhaul (absorbs Wave 6)"
initiative: battlefuel-v2
initiative_version: 4
status: planned
depends_on: battlefuel-v2-wave-9
demo_state: "A unit always reaches its destination and never freezes: the operator picks Safe (route around threat, cross only if no alternative) or Fast (shortest, crosses threat at a fuel/time penalty) plus a travel mode (road / off-road / hybrid / direct), so routes combine roads, tracks and cross-country movement (off-road carries a speed + fuel penalty); routes show as a bold primary + lighter alternatives with duration/fuel/threat and a warning when the path crosses a threat-level-5 sector; movement advances in smooth small ticks. The operator can plan by free waypoints (Waypoint routing: Start -> set points -> Remove last -> End -> Confirm move order), hand-draw a passage/road for the engine to use, add fuel depots, remove manually-added obstacles, and press Esc to exit any mode. The unit symbol's centre is always the route start."
created: 2026-06-03
hash: ea7cce4b
---

# Wave 10: Routing & Movement Overhaul (absorbs Wave 6)

> **Supersedes Wave 6.** This wave folds the entire planned Wave 6 routing/movement UX
> (Esc-to-exit, smaller movement ticks, multiple routes, manual route planning, precise
> free-waypoint vs move-to-area, on/off-road choice in the UI, remove manual obstacles,
> manually add fuel depots) into one engine-plus-UX wave, per the requester (2026-06-03).
> Wave 6 is marked `superseded` in the initiative table; do not plan it separately.

## Demo-State
A unit **always reaches its destination and never freezes**. The operator chooses a routing
**posture** — **Safe** (route around red/blocked tiles; cross only if there is no alternative)
or **Fast** (shortest path; cross threat tiles at a fuel/time penalty) — and a **travel mode**
(**road / off-road / hybrid / direct**), so routes combine roads, tracks and cross-country
movement (off-road carries a speed + fuel penalty). Routes render as a **bold primary + lighter
alternatives** with duration / fuel-on-arrival / threat, and a **warning when the chosen route
crosses a threat-level-5 sector**. The unit advances in **smooth small ticks**, not large jumps.
The operator can plan by **free waypoints** ("Waypoint routing": *Start routing* enables setting
points + *Remove last waypoint*; *End routing* saves the route and enables *Confirm move order*),
**hand-draw a passage/road** the engine will then use, **manually add fuel depots**, **remove
manually-added obstacles**, and press **Esc** to exit any active mode. The **centre of the unit
symbol is always the route start point**.

*(This wave is not complete until this can be manually demonstrated — local `make dev`, then
online `:3001`, then prod `:3000` per the wave Definition of Done.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (per requester — never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000` (needs approval first)

## Requirements traceability (requester's list, 2026-06-03)
- **Stall on blocked / high-threat (red) tile (movement ~0)** -> F1
- **Back-and-forth / no-route** (mostly fixed in Wave 1; verify + regression) -> F1
- **Units move in too-large steps** -> F3
- **Off-road / by-foot routing** (small roads, walkable ways, off-road) + **"direct" routing**
  (near-straight, terrain-following); off-road = fuel + speed penalty -> F2
- **Safe route still crosses threat (only alternative road)** — fixed by combining road + off-road
  + direct for natural routing -> F2 (engine), F1 (posture/crossing behaviour)
- **Hand-draw a new road/passage** for the routing engine -> F6
- **Waypoint routing** (Start routing / Remove last waypoint / End routing -> Confirm move order) -> F5
- **Unit symbol centre = routing start point** -> F4
- **Threat-crossing posture** (requester): Safe -> route around, cross only if no alternative;
  Fast -> shortest, cross with penalty; **both warn when crossing a threat zone over level 4
  (= level 5 on the 0-5 scale)** -> F1
- **Absorbed Wave 6 UX:** Esc-to-exit (F4), smaller ticks (F3), multiple routes (F4), manual
  route planning (F5), precise free-waypoint vs move-to-area (F5), on/off-road choice in UI (F4),
  remove manual obstacles (F6), manually add fuel depots (F6)

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | never-stall-traversal-threat-crossing | docs/60-never-stall-traversal-threat-crossing.md | complete | — |
| 2 | hybrid-direct-routing-modes | docs/61-hybrid-direct-routing-modes.md | complete | never-stall-traversal-threat-crossing |
| 3 | smaller-movement-ticks | docs/62-smaller-movement-ticks.md | complete | never-stall-traversal-threat-crossing |
| 4 | routing-mode-multi-route-ui | — | planned | hybrid-direct-routing-modes |
| 5 | waypoint-routing | — | planned | routing-mode-multi-route-ui |
| 6 | hand-drawn-passage-obstacle-depot-editing | — | planned | routing-mode-multi-route-ui |

Build order: 1 → 2 → 3 → 4 → 5 → 6.

### Feature notes
- **F1 never-stall-traversal-threat-crossing** — The core bug. In `sim_runner`/`sim.advance`,
  a `BLOCKED` tile gives `speed_factor=0.0` → zero progress but fuel still burns (movement ~0
  freeze). Fix so a unit is **never frozen**: when a tile blocks/raises threat mid-traverse,
  re-plan instead of idling. Implement the two postures on top of the existing FAST/SAFE
  `RouteMetric`: **Safe** = prefer a path that avoids red(L5)/blocked tiles, cross only if no
  alternative exists; **Fast** = shortest, cross threat at a cost penalty. Emit a route-level
  **"crosses threat sector (level 5)"** flag/warning whenever the chosen path enters a
  threat-level-5 cell. Reuse the Wave-1 distance fallback so a route is always returned when one
  geometrically exists. Deterministic regression tests: inject clock + a tile that blocks
  mid-traverse and assert the unit re-routes and arrives (no stall, no reverse).
- **F2 hybrid-direct-routing-modes** — The off-road / by-foot terrain router already exists
  (Wave 1, `terrain_router.py` + `TerrainRoutingProvider`, `mode=road|offroad`) but is **not
  surfaced** and roads-only routing feels unrealistic. Add two modes behind the routing factory:
  **`hybrid`** — stitch road + small-road/track + off-road into one natural route (use roads
  where cheap, cut cross-country where it helps, especially to dodge threat); **`direct`** —
  near-straight line that still follows the landscape/terrain cost. Off-road / direct segments
  carry a **fuel + speed penalty** (reuse unit off-road speed + terrain fuel factor). All modes
  return the same `RoutePath`/`RouteOption` shape. Deterministic tests for hybrid stitching and
  direct cost.
- **F3 smaller-movement-ticks** — "Units move in too-large steps." Today step = `speed_mps *
  dt_game_s` with `sim_time_scale=60` → ~1 km per real second, interpolated on the polyline.
  Add finer sub-stepping / a configurable smaller tick so on-screen movement is smooth and
  units don't jump past short segments or waypoints. Keep the sim deterministic (clock-injected
  tests) and fuel-burn accounting unchanged in aggregate.
- **F4 routing-mode-multi-route-ui** — Frontend. Surface the **Safe/Fast posture** and the
  **road/off-road/hybrid/direct** travel mode (the `mode` param is already accepted by the API
  but has no UI). Render **multiple routes**: bold primary + lighter alternative(s) with
  duration / fuel-on-arrival / threat. Show the **threat-level-5 crossing warning** banner from
  F1. **Esc exits** the current planning/obstacle/waypoint mode. The **route start point is the
  centre of the selected unit's symbol** (make this explicit, not just the instance coords).
- **F5 waypoint-routing** — New "**Waypoint routing**" planning mode. A **Start routing** button
  enables placing waypoints by clicking the map and enables a **Remove last waypoint** button;
  an **End routing** button saves the multi-leg route and enables **Confirm move order**. Backend
  stitches the legs (each leg via the selected travel mode) into one `RoutePath` with summed
  duration/fuel and max/avg threat. Covers the absorbed W6 "precise free-waypoint vs move-to-area"
  distinction (free waypoints here; move-to-area stays the existing click-destination flow).
- **F6 hand-drawn-passage-obstacle-depot-editing** — Three editing tools sharing the map-edit
  pattern from the existing obstacle feature: (a) **hand-draw a passage/road** — the operator
  draws a line that is injected as **routable edge(s)** into the graph (the inverse of an
  obstacle; persisted + broadcast), so subsequent routing can use it; (b) **remove
  manually-added obstacles** (extend the existing `/api/v1/obstacles` add/remove + map click);
  (c) **manually add a fuel depot** at a clicked point (persisted, rendered with the NATO
  sustainment symbol from Wave 3, available to the optimizer/refuel flow).

## Open Research
- **Mid-traverse re-route trigger (F1):** decide the cleanest hook in `sim_runner.tick` to
  detect "current/next cell became blocked or L5" and re-plan vs. nudge-around, keeping the sim
  deterministic. Confirm the Safe "no alternative -> cross" decision is computable from the
  existing degraded-fallback signal.
- **Hybrid stitching strategy (F2):** whether to run road + terrain A* and splice at the
  cheapest hand-off points, or extend a single A* whose edge set includes both road vertices and
  H3-neighbour off-road edges. Confirm perf is fine at theater scale (~146 tiles, small road graph).
- **Hand-drawn passage representation (F6):** how to inject a user-drawn line into the pgRouting
  `ways` graph (new edges + vertices snapped to the existing graph) and persist it so it survives
  a graph re-annotation; reuse the obstacles persistence/broadcast pattern.
- **Step-size model (F3):** sub-step the polyline within one tick vs. lower `sim_time_scale`
  default — pick the one that smooths visuals without multiplying WS frame volume.
