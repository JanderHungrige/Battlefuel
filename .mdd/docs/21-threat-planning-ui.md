---
id: 21-threat-planning-ui
title: Threat Planning UI
edition: MDD
depends_on: [18-dynamic-tile-updates, 12-route-planning-api, 15-move-planning-ui, 16-live-movement-ui, 10-map-overlays-inspect]
relates: [22-obstacle-tile-ops-ui, 16-live-movement-ui]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/map/overlays.ts
  - frontend/src/components/MoveRoutesPanel.tsx
  - frontend/src/components/ThreatAlerts.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/hooks/simSocket.test.ts
  - frontend/src/hooks/useSimSocket.test.ts
  - frontend/src/components/MoveRoutesPanel.test.tsx
  - frontend/src/components/ThreatAlerts.test.tsx
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [threat, planning, maplibre, websocket, tile-update, frontend, overlay]
path: Map/Movement
integration_contracts: []
satisfies_contracts:
  - from: 18-dynamic-tile-updates
    function: "tile_update WS frame"
    when: "a tile changes (manual PATCH, scripted feed, or event)"
    status: done
    verified_at: "frontend/src/hooks/useSimSocket.ts:39"
security_read_sites: []
known_issues:
  - "The live threat overlay (MapLibre WebGL) is verified manually; jsdom has no WebGL, so automated tests cover the pure tile_update parse/reduce, the useSimSocket routing, the displayedTiles merge inputs, and the MoveRoutesPanel threat warning."
---

# 21 — Threat Planning UI

## Purpose
Make threat visible and actionable: warn on route options that cross dangerous sectors, and
render a live threat overlay on the hex map that recolors as `tile_update` frames arrive
(from manual edits, the scripted feed, or random events).

## Architecture
- **`TileUpdate`** type mirrors the backend `tile_update` frame. `simSocket` gains
  `parseTileUpdate` + `applyTileUpdate`; `useSimSocket` now also accumulates
  `tileUpdates: Record<h3_index, TileUpdate>` alongside unit `positions`.
- **App** derives `displayedTiles` = each tile merged with its latest `tileUpdate` (pure
  `useMemo`, no setState-in-effect) and passes that to `MapView`, so threat/road changes
  recolor without a refetch.
- **MapView** adds a `tiles-threat` fill layer over the terrain fill, its opacity ramped by
  `threat_level` (0 → transparent, 5 → strong red). Driven by the existing `tiles` source, so
  the Wave-3 once-init + `setData` sync updates it live.
- **MoveRoutesPanel** flags an option whose `threat_max` crosses a warning threshold.
- **Hex hover tooltip** (MapView): hovering a tile shows a popup with terrain/threat/road/intel
  (tile GeoJSON now carries `road_condition`/`intel_level` in its properties).
- **Threat pop-ups** (`ThreatAlerts`): a `tile_update` at threat ≥ 3 (`isThreatAlert`) appends a
  capped (last 5) alert in `useSimSocket`, shown as a small toast stack.

```
tile_update WS → useSimSocket.tileUpdates → App.displayedTiles (merge) → MapView threat layer
RouteOption.threat_max ≥ threshold → MoveRoutesPanel warning
```

## Data Model
No persistence. `TileUpdate { type:'tile_update', h3_index, terrain, threat_level,
road_condition, intel_level, weather, cover }`.

## API Endpoints
None. Consumes the existing `/api/v1/ws` (`tile_update` frames) and `RouteOption.threat_max`
from `POST /routes/plan`.

## Business Rules
- A tile with a live `tileUpdate` renders with the updated `threat_level`/attributes
  (latest-frame-wins); tiles without one keep their seeded values.
- Threat overlay opacity scales with `threat_level`; `threat_level = 0` is fully transparent.
- A route option with `threat_max ≥ 3` shows a "⚠ crosses threat sector" warning (threshold
  is a UI constant).
- Malformed frames are dropped (reuses the socket's parse-and-skip behavior).

## Data Flow
See `.mdd/audits/flow-threat-planning-ui-2026-06-01.md`. Threat values are rendered verbatim
from `tile_update` frames and `RouteOption.threat_max`; the client computes nothing.

## Dependencies
- **18-dynamic-tile-updates** (`tile_update`), **12-route-planning-api** (`threat_max`),
  **15/16** (planning panel, sim socket), **10** (map overlays).

## Security
No new external input; inbound WS frames are validated before use. Single-user.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
