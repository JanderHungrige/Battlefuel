---
id: battlefuel-wave-3
title: "Wave 3: Routing & Movement"
initiative: battlefuel
initiative_version: 4
status: planned
depends_on: battlefuel-wave-2
demo_state: "In the app, select a unit, click a destination, and see route options (fastest & safest) with remaining fuel on arrival, duration, and route threat level; confirm a move order and watch the unit traverse the route in real time as its fuel depletes."
created: 2026-06-01
hash: d0616bd4
---

# Wave 3: Routing & Movement

## Demo-State
In the app, select a unit, click a destination, and see **route options (fastest & safest)**
with **remaining fuel on arrival**, **duration**, and **route threat level**; confirm a
**move order** and watch the unit traverse the route in **real time** as its **fuel depletes**.
*(This wave is not complete until this can be manually demonstrated.)*

## Scope
This wave makes units move. It introduces the routable road graph (**pgRouting** with a
custom threat-aware cost), route planning with fuel/time/threat estimates, move orders, the
**continuous real-time simulation clock** (game-time runs at a configurable scale, default
**60×**), and **WebSocket** live updates, plus the frontend planning + live-movement UI.

Locked inputs (initiative): **pgRouting** custom-cost routing, continuous real-time sim over
**WebSockets**, single-user server-authoritative, factory-pattern data layer. Movement
follows the road network (road speed + normal consumption); off-road movement is out of scope.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | routing-graph | docs/11-routing-graph.md | complete | — |
| 2 | route-planning-api | docs/12-route-planning-api.md | complete | routing-graph |
| 3 | move-orders | docs/13-move-orders.md | complete | route-planning-api |
| 4 | sim-engine | docs/14-sim-engine.md | complete | move-orders |
| 5 | move-planning-ui | — | planned | route-planning-api, move-orders |
| 6 | live-movement-ui | — | planned | sim-engine, move-planning-ui |

Build order: 1 → 2 → 3 → 4 → 5 (after 2 & 3) → 6.

### Feature notes
- **routing-graph** — build a noded pgRouting topology from the Hohenfels OSM extract via
  **osm2pgrouting** (ways/vertices with cost/reverse_cost). Add a custom cost that augments
  travel time by tile threat (edge → H3 cell → `tiles.threat_level`). Shortest-path query
  (`pgr_dijkstra`) wrapped behind a provider.
- **route-planning-api** — `POST /api/v1/routes/plan` (start, destination, unit type/instance)
  → **fastest** and **safest** route options; each with geometry, distance, duration (road
  speed), fuel consumed + remaining (normal consumption), and aggregate route threat level.
- **move-orders** — order model (unit instance + chosen route + status `pending`/`active`/
  `complete`) + create/confirm/list API; persisted in PostGIS.
- **sim-engine** — a background real-time loop advancing `active` orders by elapsed game-time
  (scale default 60×, configurable): interpolate unit position along the route by distance,
  deplete fuel, snap + complete on arrival. Broadcast live unit state over a **WebSocket**.
- **move-planning-ui** — select a unit, click a destination, request route options, show
  fuel/duration/threat per option, confirm → creates the move order.
- **live-movement-ui** — subscribe to the WebSocket; draw the chosen route and animate the
  unit along it with the fuel readout updating live until arrival.

## Open Research
- **osm2pgrouting setup** — install + `mapconfig.xml` (which highway classes are routable,
  default speeds/costs); how to feed `data/hohenfels.osm`.
- **Threat→cost mapping** — map each edge to a tile (edge midpoint → H3 cell) and choose the
  threat weight; "safest" = min threat-weighted cost (coincides with fastest until Wave 4
  introduces non-zero threat).
- **Fuel-during-movement model** — apply `consumption_normal_lph` over elapsed game-time at
  road speed; how remaining fuel is computed for the estimate vs. depleted during the sim.
- **Sim cadence & interpolation** — server tick interval (e.g. 1 s real), position
  interpolation along route geometry by distance, and how `current_fuel_liters` is updated.
- **WebSocket contract** — message shape (unit id, lat/lon, fuel, order status), subscription
  model, and reconnection behaviour.
- **Arrival/edge cases** — out-of-fuel mid-route, destination off the road graph (snap to
  nearest vertex), order cancellation.
