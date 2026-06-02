---
id: 44-terrain-router
title: Terrain Router — Off-Road (By-Foot) A* over the H3 Grid
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-1
wave_status: active
depends_on: [43-routing-bug-fix, 11-routing-graph, 12-route-planning-api, 17-tile-cost-model, 07-hex-tile-model-api, 13-move-orders]
relates: [43-routing-bug-fix, 14-sim-engine]
source_files:
  - backend/app/services/terrain_router.py
  - backend/app/providers/routing.py
  - backend/app/domain/route.py
  - backend/app/services/route_planner.py
  - backend/app/services/move_order_service.py
  - backend/app/api/routes.py
  - backend/app/api/move_orders.py
routes:
  - "POST /api/v1/routes/plan"
  - "POST /api/v1/move-orders"
models:
  - tiles
test_files:
  - backend/tests/test_terrain_router.py
  - backend/tests/test_routing.py
data_flow: reads-existing
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [routing, off-road, terrain, a-star, h3, by-foot, factory, route-mode]
path: Routing/Engine
integration_contracts: []
satisfies_contracts: []
security_read_sites: []
known_issues: []
---

# 44 — Terrain Router (Off-Road / By-Foot)

## Purpose

Let a unit move **cross-country off-road** over the terrain grid — not only on roads. Adds a
second `RoutingProvider` (`"terrain"`): an **A\*** search over the **H3 hex grid** with
terrain-aware cost and the unit's **off-road / by-foot** speed. It returns the **same
`RoutePath` shape** as the road router, so the planner layers duration + fuel and the sim
traverses it with no changes. A `mode=road|offroad` parameter (default `road`) selects the
router and the speed.

## Architecture

```
plan_routes / create_move_order(..., mode)        (route_planner / move_order_service)
   provider = road provider          if mode == road     (pgRouting, Feature 43)
            = build_routing_provider_for_mode(offroad)    → TerrainRoutingProvider("terrain")
   speed    = speed_road_kph (road) | speed_offroad_kph (offroad)
        → provider.shortest_path(...)  → RoutePath  → build_option(speed) → RouteOption / MoveOrder
```

* **`services/terrain_router.py` — pure, no I/O.** `terrain_path(tiles, start, dest, metric)`
  runs A\* over H3: node = hex, edge = adjacent hex (`h3.grid_disk(cell, 1)`), step cost =
  the Wave-4 **terrain** time-proxy (`edge_time_cost`) and, for `SAFE`, the threat-weighted
  `safe_edge_cost`. **Road condition is ignored** (the unit is off the roads), so off-road
  movement is always passable — terrain speed factors are never zero. Heuristic = straight-line
  haversine to the destination (admissible, since cost ≥ distance). Mirrors the `sim.py`
  (pure) / `sim_runner.py` (I/O) split, so it is unit-testable with a hand-built tile map.
* **`TerrainRoutingProvider` (in `providers/routing.py`)** — the thin I/O wrapper: loads the
  theater tiles via the tile factory, builds the `{h3 → (terrain, threat)}` map, and calls
  `terrain_path`. Registered as `"terrain"` via the Wave-3 routing factory.
* **`build_routing_provider_for_mode(mode)`** — factory helper: `road` → the configured road
  provider (pgRouting), `offroad` → the terrain provider.

The theater is ~146 tiles, so A\* is trivially fast.

## Data Model

No schema change. Reads `tiles` (`terrain`, `threat_level`) for every theater cell; hex centers
and adjacency are derived from H3 (`cell_to_latlng`, `grid_disk`). No road graph (`ways`) is used.

`domain/route.py` adds:

```python
class RouteMode(StrEnum):
    ROAD = "road"        # pgRouting road graph (default)
    OFFROAD = "offroad"  # terrain A* over the H3 grid (by-foot speed)
```

The emitted `RoutePath` is identical to the road provider's (`geometry` = hex-center
`[lon,lat]` polyline; `distance_m` = Σ real step distance; `effective_distance_m` = Σ terrain
time-cost; `fuel_distance_m` = Σ fuel_factor·time-cost; `threat_max`/`threat_avg` over path
cells; `degraded=False` — terrain routes always resolve when the grid connects).

## API Endpoints

- `POST /api/v1/routes/plan` and `POST /api/v1/move-orders` gain an optional
  `mode: "road" | "offroad"` field (default `"road"`). No response-shape change — off-road
  routes return the same `RouteOption`/`MoveOrder`.

## Business Rules

- **Mode selects router + speed.** `road` → pgRouting + `speed_road_kph`; `offroad` → terrain
  A\* + `speed_offroad_kph`. Consumption uses `consumption_normal_lph` for both.
- **Off-road is always passable.** Terrain speed factors are in `[0.5, 1.0]` (never 0), and road
  condition is ignored, so a terrain route exists whenever the destination cell is grid-connected
  to the start cell. Returns `None` only when start and destination snap to the same cell.
- **Snapping:** a start/destination outside any known tile snaps to the nearest theater cell by
  center distance (mirrors the road provider's nearest-vertex snap).
- **Orientation invariant:** `geometry[0]` is the start cell, `geometry[-1]` the destination cell.
- **SAFE avoids threat:** the `SAFE` metric threat-weights each step, so an off-road `safe` route
  detours around high-threat cells where a lower-threat path exists.
- **Same `RoutePath` contract:** `route_planner`, `move_order_service`, and the sim are unchanged
  beyond passing `mode` through.

## Data Flow

`reads-existing`: consumes `tiles.terrain` + `tiles.threat_level` (Wave 2/4) and the Wave-4 cost
model (`TERRAIN_SPEED`, `TERRAIN_FUEL`, `edge_time_cost`, `safe_edge_cost`). Produces the
established `RoutePath` → `RouteOption`/`MoveOrder` shapes consumed by the planner and sim.

## Dependencies

- `43-routing-bug-fix` — the road provider + travel-ordered geometry conventions this matches.
- `11-routing-graph` / `12-route-planning-api` — the routing factory + `RoutePath`/`build_option`.
- `17-tile-cost-model` — terrain speed/fuel factors and the safe-cost formula (single source).
- `07-hex-tile-model-api` — the H3 tile grid (terrain + threat per cell).
- `13-move-orders` — the order the off-road route is stored on; the sim traverses it unchanged.

## Security

No external/untrusted input beyond validated lat/lon, `metric`, and `mode`. No network calls,
processes, or new storage.

## Known Issues

(none — a *hybrid* router that prefers roads where cheaper and cuts across terrain otherwise is
noted in the wave's Open Research as a possible later extension; Wave 1 ships pure off-road. The
on/off-road UI toggle is Wave 6.)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
