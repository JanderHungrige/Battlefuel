---
id: 10-map-overlays-inspect
title: Map Overlays & Inspect
edition: MDD
depends_on: [09-frontend-map-shell, 07-hex-tile-model-api, 08-unit-instances]
relates: [09-frontend-map-shell]
source_files:
  - frontend/src/map/overlays.ts
  - frontend/src/map/symbols.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/components/InspectPanel.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/map/overlays.test.ts
  - frontend/src/components/InspectPanel.test.tsx
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [maplibre, h3, milsymbol, app6, overlays, inspect, frontend]
path: Map/Frontend
integration_contracts: []
satisfies_contracts:
  - from: 07-hex-tile-model-api
    function: "GET /api/v1/tiles"
    when: "hex overlay + tile inspect"
    status: done
    verified_at: "frontend/src/App.tsx:23"
  - from: 08-unit-instances
    function: "GET /api/v1/unit-instances"
    when: "unit symbols + unit inspect"
    status: done
    verified_at: "frontend/src/App.tsx:23"
security_read_sites: []
known_issues:
  - "Map WebGL rendering is verified manually (jsdom has no WebGL); automated tests cover the pure GeoJSON/symbol helpers and the InspectPanel."
  - "'Request manual update' is a placeholder affordance — wired to a real action in a later wave."
sister_projects: []
---

# 10 — Map Overlays & Inspect

## Purpose
Completes the Wave 2 demo: draws the hex grid (coloured by terrain) over the basemap,
renders placed units as APP-6 symbols, and shows a click-to-inspect panel for any tile or
unit — including the "no telemetry → request manual update" affordance.

## Architecture
- `map/overlays.ts` — pure helpers: `tilesToGeoJSON` (closed hex rings + terrain colour),
  `unitsToGeoJSON` (points carrying the SIDC), and `TERRAIN_COLORS`.
- `map/symbols.ts` — `sidcToImage` renders an APP-6 SIDC to `ImageData` via `milsymbol`
  for use as a MapLibre icon.
- `map/MapView.tsx` — adds the `tiles` fill/outline layers and the `units` symbol layer on
  map load, registers SIDC images, and wires click/hover (units take priority over tiles).
- `components/InspectPanel.tsx` — renders the selected tile or unit (with catalog stats);
  shows the no-telemetry affordance when `current_fuel_liters` is null.
- `App.tsx` — loads theater + tiles + units + catalog, owns selection state, renders the
  map, a terrain legend, and the inspect panel.

## API Endpoints
None new — consumes `/theater`, `/tiles`, `/unit-instances`, `/units`.

## Business Rules
- Tile fill colour is determined by `terrain` (`TERRAIN_COLORS`).
- Clicking a unit selects the unit; otherwise the underlying tile; empty map clears.
- A unit with `current_fuel_liters === null` shows "No telemetry received" + a request action.

## Data Flow
`App` fetches all four resources → passes to `MapView` (builds GeoJSON + SIDC icons) and to
`InspectPanel` (on selection). Selection flows back up via `onSelectTile`/`onSelectUnit`.

## Dependencies
- `09-frontend-map-shell` (map + client), `07-hex-tile-model-api` (tiles), `08-unit-instances`
  (units).

## Security
Read-only consumption of the API; no user-supplied input beyond map interaction.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
