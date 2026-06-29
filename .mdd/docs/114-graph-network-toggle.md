---
id: 114-graph-network-toggle
title: Graph-network overlay toggle
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-20
wave_status: active
depends_on: [113-routing-graph-overlay-api]
relates: [113-routing-graph-overlay-api]
source_files:
  - frontend/src/hooks/useRoutingGraph.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [routing, graph, overlay, map, toggle]
path: Routing/Graph
known_issues:
  - "The MapLibre graph layers (graph-edges-line / graph-nodes-circle) render is verified at the live make dev gate — jsdom mocks MapView; the overlays GeoJSON helpers, the fetch hook, and the toggle wiring are unit-tested."
---

# 114 — Graph-network overlay toggle

## Why

A top-row checkbox to overlay the routing graph (nodes + edges) so the operator can see the network
behind the routing calculations.

## What

- **Toggle:** a top-bar **"Graph"** checkbox (`data-testid="graph-overlay-toggle"`, both roles) →
  `showGraph` state in `App.tsx`.
- **Fetch:** `useRoutingGraph(enabled)` fetches `api.getRoutingGraph()` once when first enabled and
  caches it (the graph is static); returns `null` while disabled so the map clears the overlay.
- **Render:** `MapView` gains a `routingGraph` prop and two once-init layers drawn low in the stack
  (just above tiles, under units/routes): `graph-edges-line` (purple lines) + `graph-nodes-circle`
  (purple dots). An effect pushes `graphEdgesToGeoJSON` / `graphNodesToGeoJSON` (overlays.ts) on
  change, or `EMPTY` when the prop is null — following the established once-init + imperative
  `setData` pattern.

## Test

`overlays.test.ts`: `graphEdgesToGeoJSON` makes LineString features carrying threat and drops
degenerate (<2-point) edges; `graphNodesToGeoJSON` makes Point features. MapView layer rendering is
verified at the live gate (jsdom mocks MapView).
