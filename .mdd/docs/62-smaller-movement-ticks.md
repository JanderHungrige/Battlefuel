---
id: 62-smaller-movement-ticks
title: Smaller Movement Ticks (Sub-Stepping)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-10
wave_status: active
depends_on: [14-sim-engine, 60-never-stall-traversal-threat-crossing]
relates: [16-live-movement-ui]
source_files:
  - backend/app/config.py
  - backend/app/services/sim.py
  - backend/app/services/sim_runner.py
routes: []
models: []
test_files:
  - backend/tests/test_sim.py
data_flow: reads-existing
last_synced: 2026-06-04
status: complete
phase: all
mdd_version: 11
tags: [sim, movement, ticks, websocket, smoothing]
path: Sim/Engine
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "Sub-stepping multiplies unit_update WS frames per tick (~route_length / sim_max_step_m). Fine at single-user theater scale; revisit if multi-user or many concurrent movers."
---

# 62 — Smaller Movement Ticks (Sub-Stepping)

## Purpose

Units jumped ~1 km per broadcast frame (`sim_time_scale=60` × ~1 km/s of road speed), so movement
looked like teleporting between points. This splits each tick's per-unit advance into sub-steps of
a bounded distance and broadcasts each, so on-screen movement is smooth — without changing the game
clock, the route, or aggregate fuel.

## Architecture

New config `sim_max_step_m` (default 200 m). In `sim_runner.tick`, each active order is handed to
`_advance_order`, which loops sub-steps until the tick's game-time is consumed (or the unit
completes/halts):

```
remaining = dt_game_s
while remaining > 0 and guard < _MAX_SUBSTEPS (256):
    speed_mps = road_kph × current-tile speed_factor
    sub_dt    = substep_dt(remaining, speed_mps, sim_max_step_m)   # ≈ max_step_m of travel
    step      = advance_with_terrain(...)   # F1 look-ahead/halt, per sub-step
    persist + broadcast unit_update
    remaining -= sub_dt; stop on COMPLETE/HALTED
```

- `substep_dt(remaining, speed_mps, max_step_m)` (pure, in `sim.py`) = `min(remaining,
  max_step_m / speed_mps)`; a stationary unit collapses to the whole step.
- The loop is bounded by `_MAX_SUBSTEPS` (256) — a unit completes its route long before that, so a
  huge test `dt` (e.g. 1 000 000) still terminates quickly at arrival.
- `_persist_and_broadcast` carries the F1 halt notification (status `halted` + reason + chatter).

## Business Rules

1. Aggregate movement and fuel for a tick equal the old single-step values (sub-steps sum to the
   same total) — fuel accounting is unchanged in aggregate.
2. Each broadcast frame advances ≈ `sim_max_step_m` (looser when terrain speed changes between the
   look-ahead tile and the entering tile; still bounded well under a full-tick jump).
3. F1 halt/cross semantics apply per sub-step, so a unit halts at the obstruction edge with finer
   resolution than a whole-tick step.
4. Deterministic: `substep_dt` and `advance_with_terrain` are pure; no wall-clock or RNG.

## Data Flow

`sim_max_step_m` (config) → `tick` → `_advance_order` sub-step loop → N× `unit_update` WS frames
(was 1×) → frontend live-movement renders smaller position deltas → smooth motion.

## Dependencies

- **14-sim-engine** — the tick/advance loop refactored here.
- **60-never-stall-traversal-threat-crossing** — `advance_with_terrain` is invoked per sub-step.

## Security

No external input; a single tunable numeric config. No new storage/processes/network.

## Known Issues

See frontmatter (WS frame volume scales with route length / max-step at single-user scale).

## Bugs

(none yet)
