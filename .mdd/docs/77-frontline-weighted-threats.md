---
id: 77-frontline-weighted-threats
title: Frontline-Weighted Threats + Slower Tempo
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-14
wave_status: active
depends_on: [76-frontline-theater-layout]
source_files:
  - backend/app/domain/frontline.py
  - backend/app/services/event_engine.py
  - backend/app/config.py
routes: []
models:
  - tiles
test_files:
  - backend/tests/test_frontline.py
  - backend/tests/test_event_engine.py
data_flow: writes-existing
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [theater, frontline, threats, event-engine, scenario, tempo]
path: Scenario/Frontline
integration_contracts: []
satisfies_contracts:
  - from: 76-frontline-theater-layout
    function: "frontline_lon(lat)"
    when: "event engine weights threat spawns by distance to the front"
    status: done
    verified_at: "backend/app/services/event_engine.py:131"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 77 — Frontline-Weighted Threats + Slower Tempo

Makes threats appear **where the battle is** and **more gradually**. Until now the event engine
fired on a uniform-random tile every 120 game-seconds; this feature concentrates spawns on the
frontline + the OPFOR east and slows the tempo.

## What it does
- **`frontline.py` → `threat_weight(lat, lon)`** (new, pure) — a relative spawn likelihood:
  a Gaussian "hot band" (~1 km half-width) straddles the front; the **east** carries a broad
  baseline on top of it (mostly threat-filled); the **west** gets only a small near-front spill
  plus a baseline that **decays with depth** behind the line (occasional deep-in sightings).
  Always > 0.
- **`event_engine.py` `maybe_fire`** — replaces `rng.choice(tiles)` (uniform) with
  `rng.choices(pool, weights=[threat_weight(t.center_lat, t.center_lon) …])` — deterministic under
  the injected RNG. Tile already carries `center_lat`/`center_lon`, so no new data is needed.
- **`config.py`** — `event_mean_interval_game_s` 120 → **240** (threats appear more slowly).

## Measured distribution
Over 4000 weighted picks across a west→east strip: **~88 %** land in/east of the front,
**~32 %** within ±1 km of the front, and only **~1 %** in the deep NATO rear (>2 km behind).

## Key decisions
- Weighting lives in `frontline.py` (the shared front definition), keeping the event engine thin
  and the model unit-testable without the DB.
- Tunable constants (`_FRONT_SIGMA_DEG`, `_EAST_BASE`, `_WEST_BASE`, `_WEST_DECAY_DEG`) are module
  constants — easy to retune from the live `:3001` gate.
- Tempo is config-driven (env-overridable), not hard-coded at the call site.

## Tests
`test_frontline.py::TestThreatWeight` — positivity, peak on the front, east > deep-west,
fall-off behind the line. `test_event_engine.py::TestFrontlineWeightedSpawn` — over 500 forced
fires, >60 % land in/east of the front and <10 % in the deep rear.

## Verification
ruff + mypy(strict) clean; `test_frontline` + `test_event_engine` green; full `test_sim.py` green
as a group after `scripts/reset_road_conditions.py` (the lone full-suite sim failure is the
documented cross-file shared-DB pollution flake, not this change). Backend-only, no migration,
no frontend change. **Live gate pending.**
