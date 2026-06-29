---
id: 117-select-graph-element
title: Select a drawn graph element (Edit graph mode)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-20
wave_status: active
depends_on: [116-connect-drawn-to-graph]
relates: [116-connect-drawn-to-graph, 118-remove-drawn-road-path, 115-draw-road-path-tool]
source_files:
  - frontend/src/hooks/useDrawnEdges.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/hooks/useDrawnEdges.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [routing, graph, drawn-edge, select, edit, map, of4]
path: Routing/Graph
known_issues:
  - "The MapLibre selection (drawn-edges/drawn-edge-nodes layers, click queryRenderedFeatures, red selected-layer filter) is verified at the live make dev gate — jsdom mocks MapView; the useDrawnEdges fetch hook + the drawnEdges/drawnEdgeNodes geojson helpers are unit-tested, and GET /drawn-edges is integration-verified."
---

# 117 — Select a drawn graph element (Edit graph mode)

## Purpose

An OF-4 **Edit graph** mode that makes the operator-drawn roads/paths selectable so they can be
edited. Clicking a drawn edge or one of its end nodes selects it and highlights it **red**. This is
the foundation for F6 ([[118-remove-drawn-road-path]]). **Drawn-only:** base OSM edges are never
selectable (only `drawn_edges` rows are in this overlay).

## Architecture

Frontend-only — reuses the existing `GET /api/v1/drawn-edges` (no backend change):

- **`useDrawnEdges(enabled, reloadToken)`** — fetches `api.listDrawnEdges()` when the edit overlay
  is enabled; refetches on `reloadToken` so a create (F4) / remove (F6) updates it. Returns `null`
  while disabled (the map clears the overlay). Thin hook over the established fetch pattern.
- **`overlays.ts`** — pure `drawnEdgesToGeoJSON(edges)` (one LineString per drawn edge, carrying its
  `id` + `kind`) and `drawnEdgeNodesToGeoJSON(edges)` (the two endpoint Points per edge, carrying the
  owning `id`). Unit-tested.
- **`MapView`** — `drawnEdges` / `selectedDrawnId` / `editGraph` props + `onSelectDrawn(id|null)`.
  Three once-init layers: `drawn-edges` (orange lines) + `drawn-edge-nodes` (orange dots), drawn on
  top, and a `drawn-edges-selected` overlay (red, `line-width` bumped) filtered to `selectedDrawnId`.
  In edit mode a click `queryRenderedFeatures` on the edge + node layers → `onSelectDrawn(id)`; a
  click that hits neither → `onSelectDrawn(null)`. The selection filter updates via `setFilter` on
  `selectedDrawnId` change (same pattern as `units-selected`).
- **`App.tsx`** — a top-bar **Edit graph** toggle (OF-4, `canShow(role,'drawGraph')`), `editGraph` +
  `selectedDrawnId` state, the `useDrawnEdges` wiring, and Esc / mode-switch clearing. Edit mode is
  exclusive with the draw modes (entering one cancels the other).

## Business Rules

- Edit mode and the Add-road/Add-path draw modes are mutually exclusive (entering Edit cancels any
  active draw, and starting a draw exits Edit).
- A click on a drawn edge **or** either of its end nodes selects the **same** drawn edge (a drawn
  edge owns its endpoints — there is no standalone node concept in drawn-only).
- A click on empty space, **Esc**, or leaving Edit mode clears the selection.
- The selected element renders **red**; unselected drawn edges render orange.

## Data Flow

Reads `GET /api/v1/drawn-edges` (`DrawnEdge[]` — `id, kind, coordinates`). No writes; F6 performs the
delete. The shared `reloadToken` (bumped on create/remove) keeps the overlay in sync.

## Dependencies

- [[116-connect-drawn-to-graph]] — supplies the drawn edges (the `drawn_edges` table + the list
  endpoint) and the `reloadToken` mechanism.

## Security

None — frontend-only read of the operator's own drawn edges; no new input boundary.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
