---
id: battlefuel-wave-4
title: "Wave 4: Dynamic Battlefield — Tile-Driven Cost, Obstacles & Events"
initiative: battlefuel
initiative_version: 4
status: planned
depends_on: battlefuel-wave-3
demo_state: "Tile attributes alter movement/fuel/threat and feed the routing graph; move-order route options warn on threat sectors; manual obstacles and game-mode random events fire and mutate tiles; incoming orders / sector info (manual + scripted feed) mutate tiles, and the map updates live."
created: 2026-06-01
hash: f37d32cb
---

# Wave 4: Dynamic Battlefield — Tile-Driven Cost, Obstacles & Events

## Demo-State
Tile attributes **alter movement / fuel / threat and feed the routing graph**; planning a
move shows **route options that warn on threat sectors**; the operator can place **manual
obstacles** the router avoids; **game-mode random events** fire and mutate tiles; and
**incoming orders / sector info** (a manual operator action *and* a scripted feed) mutate
tiles — with the **map updating live** as the world changes.
*(This wave is not complete until this can be manually demonstrated.)*

## Scope
Wave 3 made units move along a static graph (threat was effectively zero, terrain cosmetic).
Wave 4 makes the **world dynamic and consequential**:

- **Full tile→cost model:** terrain type applies speed & fuel multipliers, `road_condition`
  modifies (`damaged`) or removes (`blocked`) edges, and `threat_level` raises the "safe"
  cost. The same model drives both routing edge cost **and** the sim's fuel burn / speed.
- **Rich random event engine:** a real-time loop (injectable clock + RNG) that fires a
  catalog of events mutating tiles (threat spikes, road damage, weather shifts, etc.),
  toggled by a game mode.
- **Manual + scripted tile mutation:** an operator API/UI to set a tile's threat/intel/road,
  **plus** a scripted/seeded "incoming info" feed that mutates tiles over time.
- **Live propagation:** tile changes re-annotate the affected graph edges and broadcast a
  `tile_update` frame over the existing WebSocket so the hex overlay updates live.
- **Threat-aware planning UI:** route options flag threat sectors; obstacle placement and
  operator tile edits are available from the map.

Locked inputs (initiative): pgRouting custom-cost routing, continuous real-time sim over
WebSockets, single-user server-authoritative, factory-pattern data layer. Movement still
follows the road network (off-road out of scope).

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | tile-cost-model      | docs/17-tile-cost-model.md | complete | — |
| 2 | dynamic-tile-updates | docs/18-dynamic-tile-updates.md | complete | tile-cost-model |
| 3 | manual-obstacles     | docs/19-manual-obstacles.md | complete | tile-cost-model |
| 4 | event-engine         | docs/20-event-engine.md | active | dynamic-tile-updates |
| 5 | threat-planning-ui   | — | planned | dynamic-tile-updates |
| 6 | obstacle-tile-ops-ui | — | planned | manual-obstacles, threat-planning-ui |

Build order: 1 → 2 → 3 → 4 → 5 (after 2) → 6 (after 3, 5).

### Feature notes
- **tile-cost-model** — central cost/fuel model: terrain → `speed_factor` + `fuel_factor`,
  `road_condition` → edge penalty/removal, `threat_level` → safe-cost weight. Used by the
  graph annotation (`annotate_routing`) and by the sim advance (`sim.py` speed/fuel). Provide
  a single source of truth (a cost module) consumed by both routing and sim so estimates and
  live burn agree. Re-annotation maps a mutated tile (H3 cell) → its edges.
- **dynamic-tile-updates** — `PATCH`/`POST` tile-mutation endpoint (set threat/intel/road on
  an H3 cell) **and** a scripted/seeded incoming-info feed advanced by the sim clock; on each
  change, re-annotate affected edges and broadcast a `tile_update` WS frame
  (h3_index + changed attributes). Server-authoritative.
- **manual-obstacles** — obstacle model (per-tile or per-edge block/penalty) + create/list/
  delete API, persisted in PostGIS; the router excludes/penalises affected edges; obstacle
  changes re-annotate the graph and broadcast.
- **event-engine** — rich catalog of real-time random events (threat spike, road damage,
  weather shift, ambush, …) with probabilities/magnitude/duration (temporary vs permanent),
  injectable clock + RNG for deterministic tests, behind a game-mode toggle; events mutate
  tiles via the dynamic-tile-updates pipeline (so propagation/broadcast is shared).
- **threat-planning-ui** — surface `threat_max`/sector threat on route options with a clear
  warning when a route crosses high-threat tiles; subscribe to `tile_update` frames and
  recolor the hex overlay live; event/info notifications.
- **obstacle-tile-ops-ui** — operator tools on the map: place/remove obstacles and edit a
  tile's threat/intel/road; reflect changes immediately via the live update channel.

## Open Research
- **Terrain multipliers** — defensible default `speed_factor`/`fuel_factor` per terrain type;
  `road_condition` mapping (`damaged` → speed penalty factor; `blocked` → remove edge or
  near-infinite cost). Keep a single tunable table.
- **Graph re-annotation granularity** — incremental re-annotation of only the edges whose
  midpoint falls in a mutated H3 cell (vs full re-annotate); performance on each tile change.
- **Cost/sim agreement** — ensure the planner estimate and the live sim burn use the *same*
  tile-cost model so "remaining fuel on arrival" matches what actually happens.
- **Event catalog design** — event types, fire probability, cadence vs sim clock scale,
  magnitude, and whether mutations are temporary (revert after N game-minutes) or permanent.
- **Scripted feed format** — source of "incoming orders/sector info" (seed file? schedule
  keyed to game-time?), and how it differs from / composes with random events.
- **`tile_update` WS contract** — frame shape (h3_index + changed fields), and how the
  frontend reconciles (patch the tile in state + recolor) without a full reload.
- **Threat-sector warning UX** — threshold for "warn", and how to indicate which segment/
  sector is dangerous on the route.
- **Obstacle granularity** — per-tile (whole hex) vs per-edge blocking, and how it maps onto
  the `ways` graph.
