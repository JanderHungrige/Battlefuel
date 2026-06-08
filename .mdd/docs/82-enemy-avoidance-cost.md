---
id: 82-enemy-avoidance-cost
title: Enemy-Avoidance Routing Cost
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-16
wave_status: active
depends_on: []
source_files:
  - backend/app/services/enemy_danger.py
  - backend/app/services/routing_graph.py
routes: []
models:
  - ways
test_files:
  - backend/tests/test_enemy_danger.py
data_flow: writes-existing
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [routing, enemy, opfor, safe, cost, threat]
path: Routing/Safety
integration_contracts:
  - to: 83-safe-offroad-detour
    function: "effective threat (tile + enemy) on ways.safe_cost"
    when: "SAFE detours around enemy danger as well as tile threat"
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 82 — Enemy-Avoidance Routing Cost

Makes routing **avoid enemy troops**. Until now enemy (OPFOR) units were display-only and routing
danger came solely from tile `threat_level` — so SAFE happily routed past hostiles. Now each enemy
projects a danger circle that raises the SAFE cost nearby.

## What it does
- **`enemy_danger.py`** (new, pure) — `radius_for(echelon)` maps an echelon to a danger-circle
  radius (section 400 m < platoon 700 m < company 1200 m < battalion 2000 m; unknown → 700 m).
  `enemy_threat_at(lat, lon, enemies)` returns an integer threat **0–5**: inside a unit's circle it
  ramps linearly from 5 at the centre to 0 at the rim, taking the **max** over all units; 0 outside.
  Equirectangular distance (fine across the ~10 km theater).
- **`routing_graph.annotate_ways` / `annotate_cell`** — when costing each edge, the **effective
  threat = max(tile threat, enemy-proximity threat)** feeds `safe_cost` (and the stored
  `threat_level`). So **SAFE** routes around enemy clusters and the L5/threat surfacing reflects
  enemy zones; **FAST** (`time_cost`) is untouched. Enemy positions default to the configured
  provider; `annotate_cell` (the sim's per-event re-cost) applies the boost too, so an event near an
  enemy doesn't drop it.

## Key decisions
- **Echelon-scaled radius** (requester): bigger formations dominate more ground.
- Folded into the **existing `safe_cost`/`threat_level` channel** rather than a parallel cost term —
  reuses the whole annotate→pgRouting→planner→sim pipeline and means feature 83's off-road detour
  and the route threat-max warning automatically account for enemies.
- Applied at **annotation time** (reseed / `annotate_routing` / per-cell re-cost). Enemy units are
  static-seeded today; when they later move, re-annotation refreshes the circles.

## Tests (`test_enemy_danger.py`)
Radius ordering + default + case-insensitivity; peak-at-centre, zero-outside, linear falloff,
max-over-units, empty-list, int-in-range.

## Verification
ruff + mypy(strict, 90 files) clean; `test_enemy_danger` + full backend suite **337 passed**.
Backend-only, no migration. ⚠ Takes effect after a **reseed/annotate** (`annotate_routing.py`,
included in `reseed-stack.sh`). **Live gate pending.**
