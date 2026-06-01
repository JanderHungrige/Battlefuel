---
id: 22-obstacle-tile-ops-ui
title: Obstacle & Tile Ops UI
edition: MDD
depends_on: [19-manual-obstacles, 18-dynamic-tile-updates, 21-threat-planning-ui, 10-map-overlays-inspect]
relates: [19-manual-obstacles, 21-threat-planning-ui]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/components/InspectPanel.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/api/client.test.ts
  - frontend/src/map/overlays.test.ts
  - frontend/src/components/InspectPanel.test.tsx
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [obstacles, tile-edit, operator, maplibre, frontend, ops]
path: Map/Movement
integration_contracts: []
satisfies_contracts:
  - from: 19-manual-obstacles
    function: "POST/GET/DELETE /api/v1/obstacles"
    when: "operator places/removes obstacles on the map"
    status: done
    verified_at: "frontend/src/api/client.ts:71"
  - from: 18-dynamic-tile-updates
    function: "PATCH /api/v1/tiles/{h3}"
    when: "operator edits a tile's threat/road/intel"
    status: done
    verified_at: "frontend/src/api/client.ts:75"
security_read_sites: []
known_issues:
  - "Map interactions (obstacle place/remove clicks, marker rendering) are verified manually; jsdom has no WebGL, so automated tests cover the API client methods, obstaclesToGeoJSON, and the InspectPanel tile-edit controls."
---

# 22 — Obstacle & Tile Ops UI

## Purpose
Operator tools on the map: toggle an **obstacle mode** to place/remove obstacles the router
avoids, and edit a selected tile's **threat / road / intel** from the inspect panel. Both are
server-authoritative writes; the map reflects them live.

## Architecture
- **API client** gains `listObstacles`, `createObstacle`, `deleteObstacle`, and `patchTile`.
- **App** holds `obstacles` (fetched on load) and an `obstacleMode` toggle. Single-user, so
  obstacle state is updated directly from this client's own create/delete responses (the
  `obstacle_update` WS frame exists for future multi-user but isn't consumed here).
- **Tile edits** reuse the Wave-4 echo: `patchTile` → backend broadcasts `tile_update` →
  `useSimSocket.tileUpdates` → `displayedTiles` recolors and the inspect panel refreshes (no
  extra client state needed — feature 21 already consumes `tile_update`).
- **MapView** draws an `obstacles` point layer (cell centers via `h3-js`). In obstacle mode a
  map click places an obstacle; clicking an existing obstacle marker removes it.
- **InspectPanel** shows tile-edit controls (threat 0–5, road condition, intel) when a tile is
  selected, calling `onMutateTile(h3, mutation)`.

```
obstacle mode: click map → createObstacle → obstacles state + map marker
               click marker → deleteObstacle → remove
tile edit: InspectPanel control → patchTile → tile_update WS → displayedTiles recolor
```

## Data Model
No persistence added. `Obstacle { id, h3_index, kind }` mirrors the backend. Tile edits send a
partial `{threat_level?, road_condition?, intel_level?}` to `PATCH /tiles/{h3}`.

## API Endpoints
Consumes: `GET/POST/DELETE /api/v1/obstacles`, `PATCH /api/v1/tiles/{h3}`.

## Business Rules
- Obstacle mode is a toggle; while on, the map's click places/removes obstacles instead of
  planning/inspect. Off by default.
- Obstacle markers sit at their H3 cell center. Removing is by obstacle id.
- Tile edits are available whenever a tile is selected (normal mode); they do not require
  obstacle mode. The edited tile recolors live via the `tile_update` echo.
- All writes are server-authoritative; failures surface inline and leave state unchanged.

## Data Flow
See `.mdd/audits/flow-obstacle-tile-ops-ui-2026-06-01.md`.

## Dependencies
- **19-manual-obstacles** (obstacle API), **18-dynamic-tile-updates** (`PATCH /tiles`),
  **21-threat-planning-ui** (`tile_update` consumption), **10** (inspect panel, overlays).

## Security
No new external input beyond validated API calls; single-user, server-authoritative.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
