---
id: 11-routing-graph
title: Routing Graph
edition: MDD
depends_on: [05-db-spatial-foundation, 06-osm-theater-data, 07-hex-tile-model-api]
relates: [12-route-planning-api]
source_files:
  - db/Dockerfile
  - backend/alembic/versions/0004_enable_pgrouting.py
  - backend/scripts/build_routing_graph.sh
  - backend/scripts/annotate_routing.py
  - backend/app/services/routing_graph.py
  - backend/app/providers/routing.py
  - backend/app/domain/route.py
routes: []
models:
  - ways
  - ways_vertices_pgr
test_files:
  - backend/tests/test_routing.py
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [pgrouting, osm2pgrouting, routing, graph, threat, postgis]
path: Routing/Graph
integration_contracts:
  - function: "RoutingProvider.shortest_path(start, dest, metric)"
    when: "route-planning-api (F12) computes fastest + safest options"
satisfies_contracts:
  - from: 07-hex-tile-model-api
    function: "tiles.threat_level"
    when: "per-edge threat + safe_cost annotation"
    status: done
    verified_at: "backend/app/services/routing_graph.py:33"
security_read_sites: []
known_issues:
  - "Roads treated as bidirectional (one-way restrictions ignored) for game simplicity."
  - "Routing graph (ways/ways_vertices_pgr) is built out-of-band by build_routing_graph.sh, not via Alembic; the migration only enables the pgrouting extension."
  - "osm2pgrouting needs a nodes-first highways extract; build_routing_graph.sh fetches one (separate from the basemap extract)."
sister_projects: []
---

# 11 — Routing Graph

## Purpose
Builds the routable road network and threat-aware cost model that movement depends on. Wraps
pgRouting so other features can ask for the shortest path between two points by either
distance (fast) or threat-weighted distance (safe).

## Architecture
- **DB image** (`db/Dockerfile`) extends PostGIS with **pgRouting** + **osm2pgrouting**;
  `0004_enable_pgrouting` enables the extension.
- `scripts/build_routing_graph.sh` — fetches a highways-only, nodes-first Overpass extract,
  runs **osm2pgrouting** (in-container) to build `ways` / `ways_vertices_pgr`, then annotates.
- `services/routing_graph.py` (`annotate_ways`) — adds `threat_level` + `safe_cost`
  (`length_m × (1 + 5·threat)`) per edge, threat taken from the tile at the edge midpoint.
- `providers/routing.py` — `RoutingProvider` interface + `PgRoutingProvider` (nearest-vertex
  snap + `pgr_dijkstra`, fast/safe metric) + factory; `domain/route.py` defines `RouteMetric`
  and `RoutePath`.

## Data Model
osm2pgrouting tables: `ways` (edges: `gid`, `source`, `target`, `length_m`, `the_geom`, +
added `threat_level`/`safe_cost`/`safe_reverse_cost`) and `ways_vertices_pgr` (nodes).

## API Endpoints
None (internal). Exposed via Feature 12.

## Business Rules
- `fast` minimizes `length_m`; `safe` minimizes `safe_cost`. Until Wave 4 adds non-zero
  threat, the two coincide.
- Start/destination snap to the nearest graph vertex.
- Same start/dest (or disconnected) → no path (`None`).

## Data Flow
Overpass roads → osm2pgrouting → `ways` → `annotate_ways` joins tile threat → `pgr_dijkstra`
→ `RoutePath` (geometry, distance_m, threat_max/avg).

## Dependencies
- `05` (DB), `06` (OSM extract), `07` (tile threat for the cost).

## Security
No external input; coordinates are numeric. The edges SQL is built from a fixed column
allow-list (not user input), so no injection via the pgr_dijkstra edges query.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
