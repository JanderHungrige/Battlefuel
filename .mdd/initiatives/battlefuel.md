---
id: battlefuel
title: BattleFuel
status: active
version: 4
hash: c2393776
created: 2026-05-29
---

# BattleFuel

## Overview

BattleFuel is an interactive command game and **decision-support tool focused on fuel
logistics and supply-chain orchestration** on a real-world map. The commander plans unit
movements and reacts to battlefield events while a modular optimization engine advises on
routing, refueling, and stock redistribution.

A NATO unit catalog (fuel capacity, normal/combat/idle consumption, road/offroad/combat
speed, fuel type, range, echelon, …) drives units displayed with NATO symbology on an
**offline OpenStreetMap-based map** with a CIV/Hearts-of-Iron-style grid. Each tile carries
attributes (terrain, threat level, recon/intel, weather, cover, road condition, minefields,
chokepoints, supply proximity, civilian density, …) that feed the routing graph and modify
movement, fuel consumption, and combat likelihood.

The user plans a movement; route options show **remaining fuel on arrival, duration, and
route threat level**. On move-order creation, tile-driven pop-ups warn about threat sectors
(e.g. increased fuel burn, combat probability, "fuel lasts X h of combat mode"). Obstacles,
threat changes, and events (ambush, assault) can be added manually or fire randomly based on
game mode (**Peacekeeping / Support / Conflict / Battlezone**). Orders and sector information
also arrive automatically and mutate tile features, which propagate into the routing graph.

Two roles share the world:
- **OF-4 (battalion)** — terrain and order level: tactical pop-ups, move orders, refuel
  orders, battlefield orchestration with a supply-chain focus.
- **OF-8 (joint force)** — zoomed-out view: supply stock and distribution, **fuel buy
  orders**, redistribution, and strategic support messages.

A unit overview exposes per-unit stats; units with missing telemetry surface a "no data →
request manual update" action. Behind it all sits an optimization engine that recommends
where to move, how to handle threat, where to refuel, and how to redistribute stock based on
situation, predictions, and order types.

The whole system is built modularly around a **factory design pattern** so the data layer
(units, tiles, threats) can be swapped from seeded data → real values → live data streams,
and parts can be added/removed/replaced without rewrites.

### Locked Architecture Decisions
*(Decided 2026-05-29 during initiative planning.)*
- **Backend:** Python (FastAPI) — chosen for best-in-class geospatial and optimization
  libraries (routing, solvers, predictions).
- **Frontend:** React + MapLibre GL (web).
- **Time model:** Continuous real-time simulation — a live sim clock; units traverse routes
  and fuel burns continuously; events fire in real time. (Implies a real-time update channel,
  e.g. WebSockets — see open questions.)
- **Threat-in-graph:** Custom graph attributes + custom cost function. Threat, minefields,
  recon level, etc. are first-class edge/node attributes with a custom routing cost model
  (not merely reused "traffic" penalties).
- **Modularity:** Factory pattern for all data sources; swappable, additive, no-rewrite design.

### Example tile attributes (extensible)
terrain type (road / offroad / urban / forest / water / mountain), elevation & slope, threat
level, recon/intel level, weather, road condition (clear / damaged / blocked), minefield
presence, cover/concealment, chokepoint, bridge/crossing, supply-point proximity, civilian
density, detected movements, drone detections, nearby combat.

### Example unit attributes (extensible)
NATO unit type & echelon, fuel type, fuel capacity, consumption (normal / combat / idle),
speed (road / offroad / combat), operational range, combat power, armor/weight class, crew,
recon ability, operational status, supply requirements, telemetry freshness.

## Open Product Questions
*(All resolved 2026-05-29 — decisions recorded below. These are now locked architecture inputs for wave planning.)*

- [x] **Routing engine** → **pgRouting (PostGIS)** — custom edge/node attributes and a custom
  cost function expressed in SQL over the OSM graph. (Alternatives considered: Valhalla,
  GraphHopper, custom A*.)
- [x] **Database** → **PostgreSQL + PostGIS** for all spatial data (OSM graph, tiles, units),
  with the factory pattern wrapping every access path.
- [x] **Grid shape** → **Hex tiles (CIV-style)** for movement/adjacency realism.
- [x] **Map / geographic scope** → **One fixed pre-packaged seed theater for MVP**; arbitrary
  OSM-region importer added later. Specific seed region selected during Wave 2 data prep.
- [x] **NATO symbology** → **APP-6 via the `milsymbol` JS library** (frontend renderer).
- [x] **Single-user vs multiplayer** → **Single-user, server-authoritative for MVP**; game
  state designed so multi-user can be added later without a rewrite.
- [x] **Real-time channel** → **WebSockets** (FastAPI-native) for the live sim clock and event push.
- [x] **Optimization sophistication (Wave 6)** → **Rule-based/heuristic + OR-Tools** for
  redistribution and refuel optimization; ML predictions deferred to a later milestone.
- [x] **Game-state persistence** → **Persist game state from the start** (continuous real-time
  sim requires durable state); scenario save/resume and authoring built on top.

## Waves
| Wave | File | Demo-state | Status |
|------|------|------------|--------|
| Wave 1 | waves/battlefuel-wave-1.md | Query the seeded NATO unit catalog over /api/v1/units and get full per-type stats; switch the active data provider via config with no code change. | complete |
| Wave 2 | waves/battlefuel-wave-2.md | See an offline OSM map with a grid overlay; tiles carry attributes; units render with NATO symbology; inspect any tile or unit. | complete |
| Wave 3 | waves/battlefuel-wave-3.md | Plan a unit move offline; see route options with remaining fuel, duration, and threat level; confirm a move order; watch the unit traverse and fuel deplete. | complete |
| Wave 4 | waves/battlefuel-wave-4.md | Tile attributes alter movement/fuel/threat and feed the graph; move-order pop-ups warn on threat sectors; manual obstacles and game-mode random events fire; incoming orders/sector info mutate tiles. | complete |
| Wave 5 | waves/battlefuel-wave-5.md | Switch to the OF-8 view: see fuel stocks and distribution, place fuel buy and refuel orders, receive strategic support messages; unit overview handles missing telemetry. | planned |
| Wave 6 | waves/battlefuel-wave-6.md | Ask the engine for advice: optimal movements, threat-aware routing, best refuel points, and stock-redistribution plans with rationale. | planned |
| Wave 7 | waves/battlefuel-wave-7.md | Run the full system in Docker, provisioned to a host (e.g. Hetzner) via Terraform. | planned |
