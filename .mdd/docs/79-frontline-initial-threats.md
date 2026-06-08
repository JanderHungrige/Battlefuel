---
id: 79-frontline-initial-threats
title: Frontline Initial-Threat Seed
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-14
wave_status: active
depends_on: [76-frontline-theater-layout, 78-light-threat-decay]
source_files:
  - backend/app/domain/frontline.py
  - backend/app/services/tile_seed.py
  - backend/scripts/seed_threats.py
  - backend/app/services/event_engine.py
  - backend/app/config.py
  - backend/app/services/sim_runner.py
  - Makefile
  - scripts/prod-bootstrap.sh
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
tags: [theater, frontline, threats, seed, scenario, tiles]
path: Scenario/Frontline
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 79 — Frontline Initial-Threat Seed

Gives the theater a **starting** threat picture concentrated on the front + the OPFOR east. Until
now tiles seeded at `threat_level = 0` and threat only built up from the event engine over sim
time — so a fresh map (or a dev DB carrying stale, spread-out threat from the old uniform emitter)
did **not** read as a front. This adds an explicit initial-threat seed, and tunes the decay so the
seeded east stays populated.

## Why this was needed
The requester saw threat "spread over the map, not concentrated around the front line." Root cause:
no initial threat seed existed (only the live emitter), and the dev DB held threat accumulated by
the pre-Wave-14 uniform spawner. Feature 77 fixed where *new* threats spawn; this fixes the
*starting* state.

## What it does
- **`frontline.initial_threat_level(lat, lon, rng)`** (new, pure, RNG-injected) — a starting
  threat (0–5) by zone: deep NATO rear **benign** (rare lone sighting); front **west shoulder**
  skirmishes (1–3); front **east shoulder** hottest (3–5, combat); **deep east** broadly threatened
  with a durable ~50 % floor at 3+ (`choice(1,2,3,3)`) so it stays threatened even as light threats
  fade.
- **`tile_seed.seed_frontline_threats(session, seed=1414)`** (new) — overwrites every tile's
  `threat_level` with the pattern, in `h3_index` order against a seeded RNG (deterministic /
  reproducible). Resets accumulated/stale threat. Returns tile count.
- **`scripts/seed_threats.py`** (new) — run it after `generate_tiles.py`, before
  `annotate_routing.py` (the routing graph's safe-cost reads tile threat). Wired into **`make seed`**
  and **`prod-bootstrap.sh`**.
- **Decay tuning (refines feature 78)** so the seeded east isn't instantly stripped by a running
  sim: decay is now **probabilistic per tile** (`threat_decay_chance = 0.2`) instead of a
  synchronized purge — light threats fade *gradually* and most persist at any moment, while combat
  zones (3+) never decay.

## Observed behaviour (live, 60× sim)
Just seeded: east ~91 % threatened (mean 2.2). After ~45 sim-min: east still ~63 % threatened
(mean 1.8) — light sightings have thinned but the permanent ≥3 combat floor + front-weighted
spawns keep the east populated. Deep NATO rear stays benign throughout.

## Key decisions
- The seed **reuses the frontline** (`frontline_lon`) so the threat picture and the force layout
  (feature 76) share one definition.
- Deterministic seed (fixed RNG seed) → the demo map is identical run to run.
- ⚠ **Operational:** seeing this requires reseeding (`make seed`, or `scripts/seed_threats.py`);
  after reseeding threat, re-annotate the routing graph (`scripts/annotate_routing.py` /
  `reset_road_conditions.py`) so safe-cost reflects the new threat.

## Tests
`test_frontline.py::TestInitialThreat` — range 0–5, deep rear mostly benign, east shoulder hot
(3–5), deep east broadly threatened (1–3), deterministic per seed.
`test_event_engine.py::TestLightThreatDecay` — updated for probabilistic decay (a fraction fades,
chance 1.0 clears all light, heavy/benign never decay, rate-limited, disabled never decays).

## Verification
ruff + mypy(strict, 89 files) clean; full backend suite **328 passed**; seed run live against the
dev DB (146 tiles) with the distribution confirmed by query. Backend-only, no migration, no
frontend change. **Live gate pending.**
