---
id: 118-remove-drawn-road-path
title: Remove a drawn road / path from the graph
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-20
wave_status: active
depends_on: [117-select-graph-element]
relates: [117-select-graph-element, 116-connect-drawn-to-graph]
source_files:
  - frontend/src/components/DrawnEdgeEditPanel.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/components/DrawnEdgeEditPanel.test.tsx
data_flow: writes-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [routing, graph, drawn-edge, remove, edit, of4]
path: Routing/Graph
known_issues:
  - "The DrawnEdgeEditPanel + remove wiring are unit-tested; the full select→remove→overlay-refresh flow is verified at the live make dev gate (jsdom mocks MapView). The DELETE /drawn-edges/{id} endpoint is integration-verified (remove → re-inject → 404 on unknown id)."
---

# 118 — Remove a drawn road / path from the graph

## Purpose

With a drawn edge selected ([[117-select-graph-element]]), a **Remove** action deletes it from the
routing graph: the `drawn_edges` row is removed and the graph re-injected, so the edge (and its
connectors) disappear. Drawn-only — base OSM roads can't be removed.

## Architecture

Frontend-only — reuses the existing `DELETE /api/v1/drawn-edges/{id}` (no backend change):

- **`DrawnEdgeEditPanel`** — shown while a drawn edge is selected: its kind + a **Remove** button (and
  a Cancel/deselect). Mirrors the small-panel style.
- **`App.tsx`** — `removeDrawnEdge(id)` → `api.deleteDrawnEdge(id)` → on success clear the selection,
  bump the drawn-edge `reloadToken` (so F5's overlay refetches) **and** the routing-graph overlay
  reload token (so the F2 graph overlay drops it), and post a chatter line. Errors surface via chatter
  (the panel stays so the operator can retry).

## Business Rules

- Remove deletes the **whole** selected drawn edge (its drawn line + both connectors), via the
  backend delete + re-inject — there is no partial-edge removal in drawn-only.
- After a successful remove the selection clears and both overlays refresh.
- A failed delete keeps the selection and reports the error (no silent loss).

## Data Flow

`DELETE /api/v1/drawn-edges/{id}` (F4 endpoint) removes the row and re-injects the remaining drawn
edges into `ways` / `ways_vertices_pgr`. The frontend then refetches `GET /drawn-edges` (edit overlay)
and `GET /routing-graph` (network overlay) via their reload tokens.

## Dependencies

- [[117-select-graph-element]] — supplies the selected drawn-edge id.
- [[116-connect-drawn-to-graph]] — the `DELETE` endpoint + re-inject, and the reload-token wiring.

## Security

Acts only on an operator-drawn edge id the backend already exposes via `GET /drawn-edges`; the delete
endpoint 404s on unknown ids. No new input boundary.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
