---
id: 113-routing-graph-overlay-api
title: Routing-graph overlay API (ways edges + vertices)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-20
wave_status: active
depends_on: []
relates: [114-graph-network-toggle, 11-routing-graph]
source_files:
  - backend/app/api/routing_graph.py
  - backend/app/main.py
  - frontend/src/api/client.ts
  - frontend/src/api/types.ts
routes: ["/api/v1/routing-graph"]
models: []
test_files:
  - backend/tests/test_routing_graph.py
data_flow: reads-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [routing, graph, overlay, api, pgrouting]
path: Routing/Graph
---

# 113 — Routing-graph overlay API

## Why

To understand the routing calculations, the operator needs to *see* the network the router uses.
No endpoint exposed the `ways` edges / `ways_vertices_pgr` vertices to the frontend.

## What

`GET /api/v1/routing-graph` → `RoutingGraph { edges: GraphEdge[], nodes: GraphNode[] }`:
- `GraphEdge { gid, geometry: [lon,lat][], threat_level }` from `ways` (threat for styling).
- `GraphNode { id, point: [lon,lat] }` from `ways_vertices_pgr`.

Typed Pydantic models (no `Any`); geometry parsed from `ST_AsGeoJSON` (LineString +
MultiLineString). The Hohenfels graph is small (~2.7k edges) so the whole theater returns in one
call. Frontend: `api.getRoutingGraph()` + `RoutingGraph`/`GraphEdge`/`GraphNode` types.

## Test

`test_routing_graph.py`: `_coords` parses Line/MultiLineString; the DB test asserts the endpoint
returns non-empty edges (≥2-point [lon,lat] polylines + threat_level) and nodes ([lon,lat] points).
