---
id: 09-frontend-map-shell
title: Frontend Map Shell
edition: MDD
depends_on: [06-osm-theater-data]
relates: [10-map-overlays-inspect]
source_files:
  - frontend/package.json
  - frontend/vite.config.ts
  - frontend/vitest.config.ts
  - frontend/src/config.ts
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/map/basemapStyle.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
  - frontend/scripts/sync-assets.mjs
  - backend/app/api/theater.py
  - backend/app/main.py
routes:
  - "GET /api/v1/theater"
models: []
test_files:
  - frontend/src/map/basemapStyle.test.ts
  - frontend/src/api/client.test.ts
  - frontend/src/App.test.tsx
  - backend/tests/test_theater_api.py
data_flow: greenfield
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [frontend, react, vite, typescript, maplibre, pmtiles, cors]
path: Map/Frontend
integration_contracts:
  - function: "MapView component + api client"
    when: "F10 mounts overlays and inspect panels onto this shell"
satisfies_contracts:
  - from: 06-osm-theater-data
    function: "data/hohenfels.pmtiles + Theater config"
    when: "rendered as the MapLibre basemap; centered via GET /api/v1/theater"
    status: done
    verified_at: "frontend/src/map/MapView.tsx:38"
security_read_sites: []
known_issues:
  - "Bundle is ~1.2 MB (MapLibre); code-splitting deferred."
  - "Automated tests cover the style builder, API client, and shell render; full WebGL map render is verified manually (jsdom has no WebGL)."
  - "Basemap labels omitted (no glyphs endpoint, to stay offline)."
sister_projects: []
---

# 09 — Frontend Map Shell

## Purpose
The React + TypeScript + Vite web client that renders the offline Hohenfels basemap in
MapLibre GL. Provides the app shell, the typed API client, and the map foundation that
Feature 10 extends with overlays and inspect panels.

## Architecture
- `src/config.ts` — API base, PMTiles path, OSM attribution (Vite env-overridable).
- `src/api/{types,client}.ts` — TS mirrors of the backend schemas + a typed fetch wrapper.
- `src/map/basemapStyle.ts` — pure MapLibre style builder over the PMTiles source
  (background/areas/roads; no glyph-dependent label layers).
- `src/map/MapView.tsx` — registers the `pmtiles://` protocol and mounts the map centered
  on the theater.
- `src/App.tsx` — shell: header (brand, theater name, OSM attribution) + the map; fetches
  `/api/v1/theater` for the initial view.
- `scripts/sync-assets.mjs` — copies `data/hohenfels.pmtiles` into `public/` before dev/build.
- Backend support: `GET /api/v1/theater` and CORS middleware (`app/main.py`,
  `app/config.py:cors_origins`).

## API Endpoints
- `GET /api/v1/theater` → `Theater` (bbox/center/zoom) — single source of truth for the view.

## Business Rules
- The map centers on the theater returned by the API; the basemap is served locally
  (offline) from the copied PMTiles archive.

## Data Flow
`GET /api/v1/theater` → `App` state → `MapView` (`center`/`zoom`) → MapLibre renders the
local `pmtiles://…/hohenfels.pmtiles` archive via `buildBasemapStyle`.

## Dependencies
- `06-osm-theater-data` — the PMTiles basemap and `Theater` config.

## Security
CORS restricts API access to the configured origins (dev: Vite server). The frontend makes
read-only GETs. No secrets in the client bundle.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
