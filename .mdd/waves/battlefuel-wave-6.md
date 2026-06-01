---
id: battlefuel-wave-6
title: "Wave 6: Optimization Engine — Advice with Rationale"
initiative: battlefuel
initiative_version: 4
status: planned
depends_on: battlefuel-wave-5
demo_state: "Ask the engine for advice and get recommendations with rationale: rank the best route for a chosen move and suggest unit repositioning; recommend the best refuel point / truck assignment; and compute an OR-Tools stock-redistribution plan across depots and trucks. Every recommendation is advisory — the operator clicks 'apply' to turn it into a real move / refuel / buy order (server stays authoritative; nothing auto-executes)."
created: 2026-06-01
hash: c1b313b8
---

# Wave 6: Optimization Engine — Advice with Rationale

## Demo-State
**Ask the engine for advice.** For a chosen unit + destination it **ranks the route options**
(threat vs. fuel vs. time) and can **suggest where to reposition** units; it recommends the
**best refuel point / truck assignment**; and it computes an **OR-Tools stock-redistribution
plan** across depots and trucks. **Every recommendation carries a rationale**, and is
**advisory** — the operator clicks **"apply"** to create the corresponding move / refuel / buy
order. The server stays authoritative; the engine never auto-executes.
*(This wave is not complete until this can be manually demonstrated.)*

## Scope
Waves 1–5 built the world and the manual controls (movement, dynamic battlefield, OF-8 supply
with buy/refuel orders). Wave 6 adds the **decision-support engine** that advises on top of all
of it — and slots into the **seams Wave 5 left**:

- **Refuel recommender seam:** Wave 5 shipped the `RefuelRecommender` interface with a
  `"nearest"` placeholder. Wave 6 registers the real optimizing recommender (`"ortools"`) as a
  **new implementation** — flip `settings.refuel_recommender` and order creation gets smarter
  picks, with **no caller changes**.
- **Advisory, manual-apply:** the engine returns `Recommendation`s (a choice + score +
  **rationale**); the UI shows them and offers **"apply"**, which calls the *existing* order
  endpoints (move / refuel / buy). Nothing auto-executes.
- **OR-Tools where it pays:** **stock redistribution** (a transportation/assignment problem) and
  **multi-unit refuel→truck assignment** use **OR-Tools**; **movement & route advice** stay
  **heuristic** on top of the existing pgRouting planner. (Matches the locked "rule-based/
  heuristic + OR-Tools for redistribution & refuel; ML deferred" decision.)

**Locked inputs (initiative):** Python/FastAPI backend, React + MapLibre frontend, PostgreSQL +
PostGIS, factory-pattern data layer, continuous real-time sim over WebSockets, single-user
server-authoritative. **Deferred (later milestone):** ML predictions; auto-execution of advice.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | optimizer-foundation     | docs/32-optimizer-foundation.md | complete | — |
| 2 | refuel-optimizer         | docs/33-refuel-optimizer.md | complete | optimizer-foundation |
| 3 | redistribution-optimizer | docs/34-redistribution-optimizer.md | complete | optimizer-foundation |
| 4 | movement-route-advisor   | docs/35-movement-route-advisor.md | complete | optimizer-foundation |
| 5 | advisor-ui               | docs/36-advisor-ui.md | complete | refuel-optimizer, redistribution-optimizer, movement-route-advisor |

Build order: 1 → (2, 3, 4 after 1) → 5 (after 2, 3, 4).

### Feature notes
- **optimizer-foundation** — backend scaffold the rest builds on. Add the **`ortools`**
  dependency (`pyproject.toml`). Define a shared advice domain model — `Recommendation`
  (kind, target, a structured `action` that maps to an existing order request, a numeric
  `score`, and a human `rationale` string) and a small `AdviceResult` envelope. Establish an
  **advice service interface + factory** (config-selected, like every other provider) and a
  versioned **`/api/v1/advice/*`** router namespace. No solving yet — just the contracts,
  rationale convention, and the seam each optimizer registers into.
- **refuel-optimizer** — two things, both consuming Wave-5 supply/refuel: (a) an **OR-Tools
  `RefuelRecommender` implementation** registered as `"ortools"` (cost = distance + truck
  fuel adequacy + demand urgency), a **drop-in** for per-order recommendation via the Wave-5
  factory — no change to `refuel_service`/API callers; (b) a **multi-unit refuel-assignment
  advice** endpoint that uses OR-Tools to assign trucks to several thirsty units at once and
  returns each pairing + rendezvous + **rationale**. "Best refuel point" = the chosen truck/
  depot rendezvous. Deterministic tests with fixed positions/fuel.
- **redistribution-optimizer** — model fuel **redistribution as a transportation/assignment
  problem** in OR-Tools: sources = depots/trucks with surplus, sinks = depots/units with
  demand, costs = distance/threat; output a **plan** (list of suggested transfers/buys) with a
  per-transfer **rationale** and a total-cost score. Read-only compute over `SupplyProvider` +
  unit fuel; "apply" maps a transfer to a buy order (and/or a move+refuel pairing). Surfaced at
  `/api/v1/advice/redistribution`.
- **movement-route-advisor** — **heuristic** advice on the existing planner: (a) **route
  ranking** — for a unit + destination, call `plan_routes` and score the options (threat,
  fuel-on-arrival sufficiency, duration) into a best pick with **rationale**; (b) **reposition
  suggestions** — a bounded heuristic that flags units to reposition (e.g. low-fuel units → pull
  toward the nearest depot/supply point; units in high-threat sectors → safer adjacent cell) and
  emits a suggested destination + rationale. "Apply" → a move order. (Reposition objective is a
  documented heuristic, not an optimizer — see Open Research.)
- **advisor-ui** — frontend **Advisor panel**: request advice (route ranking for the selected
  move, refuel-point/assignment, redistribution plan, reposition suggestions), render each
  `Recommendation` with its **rationale** and score, and an **"apply"** button that calls the
  existing move/refuel/buy client methods. Show the redistribution plan as a readable list (and,
  where useful, highlight depots/trucks/rendezvous on the map via the Wave-5 overlay hooks).
  Available to the relevant role(s) via the `canShow` registry.

## Open Research
- **OR-Tools model choice** — which solver fits redistribution (min-cost flow vs. linear-sum
  assignment vs. CP-SAT) and refuel assignment; problem sizes are tiny (handful of depots/units)
  so model clarity + determinism beat raw performance. Pin the `ortools` version.
- **Cost functions** — concrete cost terms for refuel assignment (distance, truck fuel vs.
  demand, unit urgency) and redistribution (distance, threat along the path, depot capacity
  headroom); keep them in one tunable table like the Wave-4 tile-cost model.
- **Reposition objective** — what "good positioning" means as a *heuristic* (fuel risk, threat
  exposure, proximity to demand) and how to bound it so it suggests a few high-value moves, not
  noise. Full positioning optimization is out of scope (ML/strategic — deferred).
- **Rationale format** — a consistent, terse rationale string (and/or structured reason codes)
  across all recommendation kinds so the UI renders them uniformly.
- **Apply contract** — exact mapping from each `Recommendation.action` to an existing order
  request (move / refuel / buy), and what feedback the UI shows after applying (chatter line,
  order id, refresh).
- **Advice freshness** — advice is computed on request against current state; decide whether/how
  it reacts to live `unit_update` / `tile_update` / supply frames (recompute button vs. staleness
  hint) without auto-running the solver every tick.
- **OR-Tools packaging** — confirm `ortools` installs cleanly in the backend venv and the Wave-7
  Docker image (wheels for the target platform); note any base-image implications early.
