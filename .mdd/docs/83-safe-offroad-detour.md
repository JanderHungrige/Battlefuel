---
id: 83-safe-offroad-detour
title: SAFE Off-Road Detour
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-16
wave_status: active
depends_on: [82-enemy-avoidance-cost]
source_files:
  - backend/app/services/route_planner.py
  - backend/app/providers/routing.py
routes: []
models: []
test_files:
  - backend/tests/test_route_planner.py
data_flow: reads-existing
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [routing, safe, offroad, detour, terrain, enemy]
path: Routing/Safety
integration_contracts:
  - from: 82-enemy-avoidance-cost
    function: "enemy_threat_at folded into the terrain tile threat"
    when: "off-road SAFE avoids enemy danger circles too"
    status: done
    verified_at: "backend/app/providers/routing.py:206"
satisfies_contracts:
  - from: 82-enemy-avoidance-cost
    function: "effective threat (tile + enemy) on routing"
    when: "SAFE detours around enemy danger as well as tile threat"
    status: done
    verified_at: "backend/app/providers/routing.py:206"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 83 — SAFE Off-Road Detour

Makes the **SAFE** metric genuinely safer than FAST instead of collapsing onto the same road. The
root cause (doc 82 / W16 investigation): both metrics ran pgRouting over the *same* road graph, so
when one road connects A→B, SAFE == FAST — it could not leave the road to go around danger.

## What it does
- **`plan_routes` SAFE auto-detour** (`route_planner.py`) — on a `road` plan (and always on
  `hybrid`), the SAFE metric now evaluates **both** the road route and the off-road (terrain)
  route and keeps the safer via `pick_route_option` (lower `threat_max`, then duration). So when the
  road runs through threat/enemy danger, SAFE takes a longer **cross-country detour** around it and
  FAST stays on the short, exposed road. On a clear road both are equal-threat → SAFE keeps the
  shorter road (no needless detour). The off-road provider is injectable (`offroad=`) for tests.
- **Off-road router is enemy-aware** (`providers/routing.py` `TerrainRoutingProvider`) — it folds
  the doc-82 `enemy_threat_at` into each tile's threat **for routing only** (not persisted, so the
  threat display + W14 decay are unaffected). So the SAFE detour avoids enemy circles as well as
  tile threat. (`DirectRoutingProvider` still ignores threat by design.)

## Key decisions
- Reuses the Wave-10 `pick_route_option` (SAFE = min threat_max then duration) and the terrain A*
  router — no new routing engine. SAFE-on-road effectively becomes "best of road / off-road",
  which is what the requester expected ("longer way around avoiding threats").
- Enemy danger is folded into the terrain router **in memory** (consistent with doc 82 keeping it
  out of the persisted tile threat).
- FAST is never detoured — it remains the short/exposed road for contrast.

## Tests (`test_route_planner.py::TestSafeAutoDetour`)
With fake road/off-road providers: SAFE takes the off-road geometry when the road is dangerous
(threat 5 vs 0) while FAST stays on the road; SAFE keeps the shorter road when both are equal-threat.

## Verification
ruff + mypy(strict, 90 files) clean; full backend suite **339 passed** (no routing regressions).
Backend-only, no migration, no frontend change (the SAFE off-road geometry renders as-is). ⚠ Enemy
avoidance needs a **reseed/annotate**; the off-road detour is computed live. **Live gate pending.**
