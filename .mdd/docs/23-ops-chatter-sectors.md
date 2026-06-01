---
id: 23-ops-chatter-sectors
title: Ops Chatter & Sector Status
edition: MDD
depends_on: [18-dynamic-tile-updates, 21-threat-planning-ui, 22-obstacle-tile-ops-ui, 07-hex-tile-model-api]
relates: [21-threat-planning-ui, 22-obstacle-tile-ops-ui]
source_files:
  - backend/alembic/versions/0007_add_tile_situation_note.py
  - backend/app/models/tile.py
  - backend/app/domain/tile.py
  - backend/app/providers/tiles.py
  - backend/app/services/tile_mutation.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/components/ChatterLog.tsx
  - frontend/src/components/ObstacleKindPicker.tsx
  - frontend/src/components/InspectPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/map/overlays.ts
  - frontend/src/App.tsx
  - frontend/src/index.css
routes:
  - PATCH /api/v1/tiles/{h3_index}
models:
  - tiles
test_files:
  - backend/tests/test_tile_mutation.py
  - frontend/src/hooks/simSocket.test.ts
  - frontend/src/hooks/useSimSocket.test.ts
  - frontend/src/components/ChatterLog.test.tsx
  - frontend/src/components/ObstacleKindPicker.test.tsx
  - frontend/src/components/InspectPanel.test.tsx
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [chatter, radio-log, sectors, situation, obstacles, maplibre, frontend]
path: Map/Movement
integration_contracts: []
satisfies_contracts:
  - from: 18-dynamic-tile-updates
    function: "tile_update WS frame (now carries situation/note)"
    when: "sector status changes feed the chatter log"
    status: done
    verified_at: "frontend/src/hooks/useSimSocket.ts:60"
security_read_sites: []
known_issues:
  - "Map interactions (right-click info popup, yellow highlight border, obstacle markers) are verified manually; jsdom has no WebGL. Automated tests cover the chatter reducer/log, obstacle picker, sector situation/note editor, and backend situation/note round-trip."
---

# 23 — Ops Chatter & Sector Status

## Purpose
Operator situational-awareness layer: a side **chatter log** ("radio messages") of sector
status changes, move orders, and events; clickable messages that **highlight the referenced
hex with a yellow border**; a **sector situation + free-text note** you can set per tile; an
**obstacle-type picker**; and a **right-click** hex info popup (instead of hover).

## Architecture
- **Sector situation + note (backend):** two new nullable `tiles` columns `situation`
  (constrained set) and `note` (free text), threaded through `Tile`, `TileMutation`, the
  provider, and the `tile_update` frame. Edited from the InspectPanel "Edit sector" controls
  via the existing `PATCH /tiles/{h3}`.
- **Chatter log:** `useSimSocket` builds a capped chatter feed from every `tile_update`
  (`describeTileUpdate`) in the socket callback, and exposes `pushChatter()` so App can add
  order/manual lines on the same sequence. `ChatterLog` renders newest-first; a message with
  an `h3_index` is clickable.
- **Hex highlight:** clicking a chatter line sets App `highlightH3`; MapView filters a
  `tiles-highlight` yellow line layer to that cell and recenters on it.
- **Obstacle picker:** `ObstacleKindPicker` (shown in obstacle mode) selects the `kind`
  (minefield, roadblock, crater, barricade, checkpoint) sent to `createObstacle`; markers label
  their kind.
- **Right-click info:** MapView's hex popup moves from `mousemove` to `contextmenu` (left-click
  still selects/inspects).

## Data Model
New `tiles` columns: `situation` (text, nullable — one of: quiet, enemy_contact, under_fire,
combat, secured, supply_point, medevac) and `note` (text, nullable, free). `SectorSituation`
StrEnum in the domain. `TileMutation` gains optional `situation`/`note`.

## API Endpoints
`PATCH /api/v1/tiles/{h3_index}` now also accepts `situation` and `note`. `tile_update` frame
gains `situation`/`note`.

## Business Rules
- Chatter is capped (most recent ~50); newest first; entries: `status` (from tile_update),
  `order` (move confirmed), with an optional `h3_index` for click-to-highlight.
- Clicking a chatter message highlights its hex (yellow border) and recenters; clicking the map
  or clearing selection drops the highlight.
- Sector `situation` is one of the fixed set or unset; `note` is free text (sent as-is).
- Obstacle `kind` defaults to the picker's current selection (`minefield` initial).
- The hex quick-info popup appears on right-click only.

## Data Flow
See `.mdd/audits/flow-ops-chatter-sectors-2026-06-01.md`. Sector edits write `tiles` and echo
via `tile_update` → chatter + overlay. Chatter is rendered verbatim from server frames + local
order events.

## Dependencies
- **18-dynamic-tile-updates** (mutation + `tile_update`), **21** (`tile_update` consumption,
  overlay), **22** (obstacle create, tile edit), **07** (tiles).

## Security
Single-user, server-authoritative. `note` is free text rendered as React text (not HTML), so
no injection; `situation` constrained by `TileMutation`. No new secrets.

## Known Issues
<!-- populated by audits -->

## Bugs
(none yet — populated by /mdd bug when issues are reported)
