---
id: battlefuel-v2-wave-16
title: "Wave 16: Routing safety — enemy avoidance + real Safe detours + per-leg waypoint modes"
initiative: battlefuel-v2
initiative_version: 10
status: planned
depends_on: none
demo_state: "The SAFE metric now produces genuinely safer routes than FAST instead of collapsing onto the same road. It avoids enemy troops — each OPFOR unit projects a danger circle whose radius scales with its echelon (section < platoon < company) — and avoids high-threat tiles, and when the only road runs through danger it takes a longer OFF-ROAD detour around it and rejoins the road (Fast still takes the short, exposed road). In manual waypoint routing each leg can use its own travel mode (e.g. leg 1 on road, leg 2 off-road); changing one waypoint's mode re-plans only that leg, not the whole route."
created: 2026-06-08
hash: acfd2a5f
---

# Wave 16: Routing safety — enemy avoidance + real Safe detours + per-leg waypoint modes

> **Requested 2026-06-08, build BEFORE Wave 13.** Manual inspection shows much safer routes exist
> than the engine picks: SAFE and FAST are often identical, enemy units are ignored by routing, and
> the only "safe" lever can't leave the road. This wave makes SAFE actually safe and gives manual
> routing per-leg mode control.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000` (needs approval first)

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | enemy-avoidance-cost | docs/82-enemy-avoidance-cost.md | complete | — |
| 2 | safe-offroad-detour | docs/83-safe-offroad-detour.md | complete | enemy-avoidance-cost |
| 3 | per-leg-waypoint-modes | docs/84-per-leg-waypoint-modes.md | complete | — |

Build order: 1 → 2, with 3 independent.

**Build status (2026-06-09):** all 3 features built + green (backend 342 tests, frontend 218, mypy/ruff/tsc/eslint/prod-build). F1/F2 on dev (need `annotate_routing` to show — now auto on deploy via startup_data). Wave OPEN — Done-When gates pending.

### Current state (from code investigation 2026-06-08)
- **SAFE vs FAST** (`cost_model.py:48-84`, `routing.py:34-37`): both run pgRouting over the **same
  road `ways` graph**; FAST minimises `time_cost`, SAFE minimises `safe_cost = time_cost × (1 + 5 ×
  threat_level)`. SAFE **cannot leave the roads**, so when one road connects A→B, SAFE == FAST.
- **Enemy units are display-only** (`enemy_units.py`) — **never** read by `cost_model`/`routing`/
  `route_planner`. Routing danger comes **only** from tile `threat_level` (`routing_graph.py:39-51`).
- **Waypoint mode is global** (`api/routes.py PlanWaypointsRequest.mode`, `route_planner.plan_legs`
  :223-240 picks one provider for all legs); the frontend (`useMovePlanning.ts:139`) re-plans the
  whole route on mode change.

### Feature notes (requester 2026-06-08)
- **F1 enemy-avoidance-cost** — make routing **avoid enemy troops**. Each OPFOR unit projects a
  **danger circle whose radius scales with its echelon** (section < platoon < company). Ways/tiles
  inside a circle get elevated danger so the SAFE cost routes around enemy clusters; recomputed when
  enemy positions change (alongside `annotate_routing` / tile threat). Feeds the same `safe_cost`
  channel (decided: echelon-scaled radius). FAST is unaffected (still shortest).
- **F2 safe-offroad-detour** — let the **SAFE metric leave the road** to detour around a
  threatened/enemy-occupied (or blocked) road segment and rejoin, producing the "longer but safer"
  routes (decided: off-road detours allowed). Reuse the Wave-10 terrain/H3 router + hybrid stitch so
  SAFE can stitch road→off-road→road; FAST stays on the short exposed road. Keep it deterministic +
  bounded for performance.
- **F3 per-leg-waypoint-modes** — each manual **waypoint leg carries its own `RouteMode`**
  (road/offroad/hybrid/direct). Backend: per-waypoint mode in the plan/move-order request +
  `plan_legs` selects the provider/speed **per leg**. Frontend: a per-waypoint mode control;
  changing one waypoint's mode re-plans **only that leg**, not the whole route.

## Open Research (resolve at plan-time)
- **Enemy danger model** — echelon → radius mapping (e.g. section ~400 m / platoon ~700 m /
  company ~1200 m) and how proximity maps to cost (flat danger inside the circle vs distance
  falloff); whether it writes to a tile-threat overlay or a separate ways-cost term; recompute
  trigger when enemies move.
- **Safe off-road detour mechanism** — SAFE as a hybrid (road + terrain stitch around danger) vs
  running SAFE on the terrain router with a road-preference; performance bound (the terrain router
  is H3-based) and how the off-road leg's fuel/speed penalty is surfaced.
- **Per-leg mode UI** — how the operator sets each leg's mode (dropdown per waypoint in the panel)
  and how the per-leg request shape extends the current single-`mode` waypoint API.
