---
id: 115-draw-road-path-tool
title: Draw road / path tool (OF-4 graph authoring)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-20
wave_status: active
depends_on: [114-graph-network-toggle]
relates: [114-graph-network-toggle, 116-connect-drawn-to-graph]
source_files:
  - frontend/src/hooks/useDrawGraph.ts
  - frontend/src/components/DrawGraphPanel.tsx
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/roles.ts
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/hooks/useDrawGraph.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: greenfield
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [routing, graph, draw, road, path, map, of4]
path: Routing/Graph
known_issues:
  - "The MapLibre draw layers (draw-line / draw-line-path / draw-vertices) + click-to-drop-waypoint are verified at the live make dev gate — jsdom mocks MapView; the draw state machine (useDrawGraph), the geojson helpers, and the panel/toggle wiring are unit-tested."
---

# 115 — Draw road / path tool

## Purpose

OF-4 operator tool to hand-author new roads and paths onto the map. "Add road" draws a **solid**
line (intended for road routing); "Add path" draws a **dotted** line (off-road/track). This feature
delivers the draw interaction; F4 ([[116-connect-drawn-to-graph]]) turns a finished line into a
routable graph edge.

## Architecture

Mirrors the established draw-mode + waypoint-routing patterns:

- **`useDrawGraph` hook** — holds the draw state machine: `mode` (`'road' | 'path' | null`), the
  ordered `points` (`{ lat, lon }[]`), and a `finished` line ( `{ kind, points }` ) produced by
  **stop**. Actions: `start(kind)`, `addPoint(lat, lon)`, `removeLast()`, `stop()` (moves the
  active line into `finished` and clears the mode), `cancel()` (discard), `clearFinished()`. The
  `finished` value is the hand-off to F4 — in F3 alone it is simply cleared.
- **`DrawGraphPanel`** — a panel shown while a draw mode is active: the kind label, the waypoint
  count, **Remove last waypoint**, and **Stop draw road/path**.
- **`overlays.ts`** — pure `drawnLineToGeoJSON(points)` (LineString, ≥2 pts) + `drawnVerticesToGeoJSON(points)`
  (Point per waypoint), unit-tested.
- **`MapView`** — `drawMode` / `drawPoints` / `onDrawWaypoint` props; two once-init layers
  (`draw-line`, `draw-vertices`) drawn above routes. A click in draw mode drops a waypoint
  (`onDrawWaypoint`) and takes precedence over select/inspect. The line's dash is set per mode
  (`setPaintProperty('draw-line', 'line-dasharray', …)`): road solid, path dotted.
- **`roles.ts`** — new `drawGraph` PanelKey, OF-4 only (tactical authoring; never in OF-8).
- **`App.tsx`** — top-row **Add road** / **Add path** buttons (gated `canShow(role, 'drawGraph')`),
  the panel, Esc cancels the draw, and the MapView wiring.

## Business Rules

- Only one draw mode active at a time; selecting "Add road" while "Add path" is active switches kind
  and resets the line (and vice-versa).
- Draw mode is exclusive with the other map modes — entering it clears any selection/planning; the
  obstacle/depot/plan click handlers do not fire while drawing.
- **Esc** exits and discards the in-progress line (consistent with W10 obstacle/depot modes).
- A line needs **≥2 waypoints** to render a segment; a single point shows just its vertex dot.
- Road draws **solid**, path draws **dotted**.

## Data Flow

Greenfield (no backend). Clicks → `useDrawGraph.points` → `MapView` draw layers. The `finished`
line is consumed by F4 to POST a drawn edge; in F3 it is discarded on `clearFinished()`.

## Dependencies

- [[114-graph-network-toggle]] — same map-overlay + once-init source pattern; the drawn line reads
  cleanly against the graph overlay.

## Security

None — frontend-only interaction; no input boundary or persistence in this feature.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
