---
id: battlefuel-v2-wave-19
title: "Wave 19: True hybrid routing — best-of-both in one route"
initiative: battlefuel-v2
initiative_version: 11
status: planned
depends_on: battlefuel-v2-wave-18
demo_state: "Hybrid produces ONE composed route, not a whole-route pick of road-or-off-road. For a unit in a field near a road heading to a target in another field, the hybrid route stubs cross-country to a road, follows roads for as long as that reduces travel time most (FAST) or is safest (SAFE), then breaks off-road again where cross-country reaches the target faster/safer — and for short trips it picks a direct route when that beats road+off-road. The composed route shows its segments (road vs off-road) and its duration/fuel/threat."
created: 2026-06-26
hash: 76bbb0cf
---

# Wave 19: True hybrid routing

> **Requested 2026-06-26 (brain-dump batch).** Today "hybrid" just returns whichever WHOLE route
> (road or off-road) wins. The requester wants hybrid to combine both within a single route:
> get to a road, ride it while it helps, then peel off-road to the target.

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
| 1 | segmented-hybrid-router | docs/110-segmented-hybrid-router.md | complete | — |
| 2 | hybrid-direct-shortcut | docs/111-hybrid-direct-shortcut.md | complete | segmented-hybrid-router |
| 3 | hybrid-route-segment-ui | — | planned | segmented-hybrid-router |

Build order: 1 → 2 → 3.

### Current state (code investigation 2026-06-26)
- **Hybrid = whole-route pick, not a stitch.** `route_planner.pick_route_option` chooses the
  better of the WHOLE road option vs the WHOLE off-road option (FAST→duration, SAFE→threat then
  duration). `plan_routes` computes each provider end-to-end and never combines them. The
  `stitch_paths` helper (used for waypoint legs) is the building block for a real composed route.
- **Direct router exists.** `direct_path` / `DirectRoutingProvider` already gives a near-straight
  terrain route — the candidate for the short-trip shortcut.

### Feature notes (requester 2026-06-26)
- **F1 segmented-hybrid-router** — build one route that stitches **off-road stub → road run →
  off-road run** (and any beneficial alternation): enter the road network at the cheapest access
  point, stay on roads while doing so reduces total time (FAST) / threat-cost (SAFE), then leave
  to the target where cross-country is better. Implement as a composed plan over the existing road
  + terrain providers (reuse `stitch_paths`); keep it deterministic and bounded.
- **F2 hybrid-direct-shortcut** — for short legs, evaluate the direct route too and choose it when
  it beats the road+off-road composition on the active metric.
- **F3 hybrid-route-segment-ui** — surface the composed route with its road vs off-road segments
  distinguished (off-road dashed, consistent with W18) and the combined duration/fuel/threat.

## Open Research (resolve at plan-time)
- Segmentation algorithm: candidate road entry/exit points (nearest-edge snaps from W18) and a
  bounded search over enter/exit pairs vs a cost-graph that unifies road + terrain edges.
- Performance: the terrain router is H3-based; cap the off-road search radius around the
  start/target and around the road corridor.
- How this composes with per-leg waypoint modes (Wave 16 F3) when a leg's mode is `hybrid`.
