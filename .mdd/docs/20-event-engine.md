---
id: 20-event-engine
title: Random Event Engine
edition: MDD
depends_on: [18-dynamic-tile-updates, 17-tile-cost-model, 14-sim-engine, 07-hex-tile-model-api]
relates: [18-dynamic-tile-updates, 21-threat-planning-ui]
source_files:
  - backend/app/services/event_engine.py
  - backend/app/services/sim_runner.py
  - backend/app/config.py
routes: []
models: []
test_files:
  - backend/tests/test_event_engine.py
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [events, simulation, random, tiles, threat, combat, game-mode]
path: Map/Events
integration_contracts: []
satisfies_contracts:
  - from: 18-dynamic-tile-updates
    function: "apply_tile_mutation + tile_update broadcast"
    when: "an event fires or a temporary event reverts"
    status: done
    verified_at: "backend/app/services/event_engine.py:150"
security_read_sites: []
known_issues: []
---

# 20 — Random Event Engine

## Purpose
A real-time random event loop that makes the battlefield dynamic: each sim tick it may fire a
catalog event that mutates a random tile (threat spikes, combat, road damage, weather, intel),
flowing through the same `apply_tile_mutation` + `tile_update` path as the scripted feed.
Deterministic under test (injected RNG + clock) and gated by a `game_mode` toggle.

## Architecture
`services/event_engine.py` holds an `EVENT_CATALOG` of `EventSpec`s and an `EventEngine` with
an injected `random.Random` and a list of pending reverts. The SimEngine creates one (seeded
from config) and calls `step()` each tick.

- **Pure, testable pieces:** `EventEngine.maybe_fire(tiles, now_s, dt)` (rolls the per-tick
  probability `dt / mean_interval`, picks a tile + event, schedules a revert if temporary, and
  returns the `(h3, mutation)` to apply) and `collect_due_reverts(now_s)`.
- **`step(session, tiles, manager, now_s, dt)`** applies due reverts and any new event via
  `apply_tile_mutation`, broadcasting each `tile_update`.

```
sim tick → EventEngine.step → [due reverts] + maybe_fire → apply_tile_mutation → tile_update WS
```

## Data Model
No new tables. Reverts are in-memory `(revert_at_game_s, h3_index, TileMutation)`.

### Event catalog
| Event | Mutates | Magnitude | Duration |
|-------|---------|-----------|----------|
| threat_spike | threat_level | +2 (cap 5) | temporary ~10 game-min |
| combat_area | threat_level | → 4 | **permanent (until user/event changes it)** |
| active_combat | threat_level + road_condition | → 5 and road→damaged | temporary ~10 min |
| road_damage | road_condition | → damaged | temporary ~30 min |
| road_blocked | road_condition | → blocked | temporary ~15 min |
| weather_shift | weather | random fog/rain/storm | temporary ~20 min |
| intel_report | intel_level | → high | permanent |
| threat_clears | threat_level | −1 (floor 0) | permanent |
| drone_activity | threat_level | +1 (cap 5) | temporary ~15 min |
| minefield | road_condition | → blocked | **permanent (until cleared)** |
| area_secured | threat_level | → 0 | **permanent (until changed)** |

## API Endpoints
None. Events are emitted over the existing `/api/v1/ws` as `tile_update` frames.

## Business Rules
- Per-tick fire probability = `min(1, dt_game_s / event_mean_interval_game_s)` (default mean
  interval 120 game-s ≈ one event per ~2 game-minutes). Tunable via config.
- A temporary event snapshots the tile's prior values for the attributes it touches and
  schedules a revert at `now + duration`; a permanent event (combat_area, intel_report,
  threat_clears) schedules no revert.
- `game_mode = False` disables firing entirely (pending reverts still drain).
- The RNG is injected, so a seeded engine produces a reproducible sequence (tests).

## Data Flow
See `.mdd/audits/flow-event-engine-2026-06-01.md`. Writes tiles (via apply_tile_mutation,
which re-costs the cell); broadcasts `tile_update`. No external input.

## Dependencies
- **18-dynamic-tile-updates** (mutation + broadcast + re-annotation pipeline),
  **14-sim-engine** (clock + tick loop), **07-hex-tile-model-api** (tiles).

## Security
Single-user, server-authoritative; no external input. Mutations are bounded by `TileMutation`
validation. RNG is local; no secrets.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
