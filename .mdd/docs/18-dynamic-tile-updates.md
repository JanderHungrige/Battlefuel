---
id: 18-dynamic-tile-updates
title: Dynamic Tile Updates
edition: MDD
depends_on: [17-tile-cost-model, 07-hex-tile-model-api, 14-sim-engine, 11-routing-graph]
relates: [20-event-engine, 21-threat-planning-ui, 17-tile-cost-model]
source_files:
  - backend/app/domain/tile.py
  - backend/app/providers/tiles.py
  - backend/app/services/tile_mutation.py
  - backend/app/services/routing_graph.py
  - backend/app/providers/tile_feed.py
  - backend/app/services/sim_runner.py
  - backend/app/api/tiles.py
  - backend/app/config.py
routes:
  - PATCH /api/v1/tiles/{h3_index}
models: []
test_files:
  - backend/tests/test_tile_mutation.py
  - backend/tests/test_tile_feed.py
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [tiles, mutation, websocket, scripted-feed, realtime, routing, re-annotation]
path: Map/Dynamic
integration_contracts:
  - function: "tile_update WS frame"
    when: "any tile attribute changes (manual PATCH, scripted feed, or — later — events)"
    note: "frontend (21-threat-planning-ui) reconciles by patching the tile + recoloring"
satisfies_contracts:
  - from: 17-tile-cost-model
    function: "annotate_cell — re-cost edges in a mutated tile"
    when: "after any tile mutation that changes threat/road"
    status: done
    verified_at: "backend/app/services/tile_mutation.py:28"
security_read_sites: []
known_issues: []
---

# 18 — Dynamic Tile Updates

## Purpose
Make the world mutable at runtime: a manual operator endpoint to change a tile's
threat/road/intel/weather/cover, **plus** a scripted "incoming sector info" feed advanced by
the sim clock. Every change re-costs the affected routing edges (so routing/sim react) and
broadcasts a `tile_update` frame so the map updates live.

## Architecture
- **`TileMutation`** (domain) — a partial update (all fields optional, `extra="forbid"`).
- **`DbTileProvider.update_tile`** — applies the mutation to the `tiles` row.
- **`routing_graph.annotate_cell`** — incremental re-annotation: recompute `time_cost`/
  `safe_cost`/factors only for the edges in the mutated H3 cell (via a stored `cell_h3` column
  on `ways`, now populated by `annotate_ways`). Uses the shared cost model (17).
- **`tile_mutation.apply_tile_mutation`** — orchestration: update row → re-annotate cell →
  return the updated `Tile`.
- **`PATCH /api/v1/tiles/{h3_index}`** — applies a mutation and broadcasts `tile_update`.
- **Scripted feed** (`providers/tile_feed.py`) — a `TileFeedProvider` (factory: `scripted`/
  `none`) of timed `FeedEvent(at_game_s, lat, lon, mutation)`; the sim runner tracks a
  game-time clock and applies events as they come due (same mutation + broadcast path).

```
PATCH /tiles/{h3}  ─┐
scripted feed (sim) ─┼─→ apply_tile_mutation → update row + annotate_cell → tile_update WS
(events, feature 20)─┘
```

## Data Model
No new tables. New `ways` column `cell_h3` (text, populated by `annotate_ways`) enables
targeted re-annotation. `TileMutation`: optional `threat_level` (0–5), `road_condition`,
`intel_level`, `weather`, `cover`.

## API Endpoints
- `PATCH /api/v1/tiles/{h3_index}` — body `TileMutation` (partial). Returns the updated `Tile`;
  `404` if the tile does not exist. Side effects: re-costs the cell's edges, broadcasts
  `tile_update`.

`tile_update` WS frame: `{type, h3_index, terrain, threat_level, road_condition, intel_level,
weather, cover}`.

## Business Rules
- Only listed attributes are mutable; `terrain` and geometry are fixed (geographic).
- A mutation that changes threat or road re-costs the cell's edges immediately, so the next
  route plan / sim tick sees the change. `road_condition=blocked` makes the cell's edges
  impassable (via the cost model).
- The scripted feed fires each event once, when game-time first passes `at_game_s`. Feed
  provider `none` disables it (used in tests/CI).
- Broadcast is best-effort (dead sockets dropped), matching `unit_update`.

## Data Flow
See `.mdd/audits/flow-dynamic-tile-updates-2026-06-01.md`. Writes `tiles` + `ways`; emits
`tile_update`. Mutation values are server-validated (`TileMutation` bounds/enums).

## Dependencies
- **17-tile-cost-model** (`annotate_cell` re-cost), **07-hex-tile-model-api** (tiles),
  **14-sim-engine** (clock + WS broadcast), **11-routing-graph** (`ways`).

## Security
Single-user, server-authoritative. The PATCH input is validated by `TileMutation`
(bounded ints, enum members, `extra="forbid"`). No new secrets, no untrusted file/network input.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
