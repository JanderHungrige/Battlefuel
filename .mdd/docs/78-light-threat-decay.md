---
id: 78-light-threat-decay
title: Light-Threat Decay
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-14
wave_status: active
depends_on: []
source_files:
  - backend/app/services/event_engine.py
  - backend/app/services/sim_runner.py
  - backend/app/config.py
routes: []
models:
  - tiles
test_files:
  - backend/tests/test_event_engine.py
data_flow: writes-existing
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [theater, threats, decay, event-engine, scenario]
path: Scenario/Frontline
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 78 — Light-Threat Decay

Makes light threats **fade** instead of persisting. Before Wave 14 only specific temporary events
reverted (e.g. `drone_activity` after 15 game-min); a tile left at a low threat level otherwise
stayed there forever (`threat_clears` was a permanent one-shot, no general decay). This adds a
periodic decay pass so transient light threats drift back to benign.

## What it does
- **`EventEngine.decay_due(tiles, now_s)`** (new) — once per `decay_interval_game_s`, returns a
  `threat_level - 1` mutation for every tile at `1 <= threat_level <= light_threat_max`. Rate-limited
  by an internal `_next_decay_s` so it fires at most once per interval; disabled when the engine is
  off. Pure (no DB) — fully unit-testable.
- **`EventEngine.step`** applies the decay mutations against the DB and broadcasts each
  `tile_update`, alongside the existing reverts + new-event flow.
- **`config.py`** — `threat_decay_interval_game_s = 600` (10 game-min) + `light_threat_max = 2`;
  wired through in `sim_runner.py`.

## Key decisions
- **Only light threats decay** (levels 1–2). Combat zones (3–5) persist — red stays red. This is the
  intended reconciliation with "the East is mostly threat-filled" (feature 77): new spawns in the
  contested east outpace decay, so the front stays active while **stale sightings clear**.
- Decay is a **periodic pass keyed off the sim clock** (not a per-tick probability), so it's
  deterministic and easy to reason about; interval + threshold are config/env-overridable.
- `drone_activity`'s existing 15-min temporary revert is left as-is (it already fades); this feature
  is the *general* decay that was missing.

## Tests (`test_event_engine.py::TestLightThreatDecay`)
No decay before the interval; light threats step down one level after it; heavy (4) and benign (0)
tiles untouched; rate-limited to one pass per interval; disabled engine never decays.

## Verification
ruff + mypy(strict) clean (89 files); full backend suite **322 passed**; `test_sim.py` green as a
group. Backend-only, no migration, no frontend change. **Live gate pending.**
