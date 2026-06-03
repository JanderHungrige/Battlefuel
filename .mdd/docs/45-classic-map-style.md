---
id: 45-classic-map-style
title: Classic Light Map Style
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-2
wave_status: active
depends_on: []
relates: [46-framed-map-and-hexes, 48-accent-and-selection-restyle]
source_files:
  - frontend/src/map/basemapStyle.ts
  - frontend/src/App.tsx
  - frontend/src/roles.ts
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/map/basemapStyle.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [map, maplibre, basemap, style, offline, pmtiles, legend]
path: Map/Style
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 45 — Classic Light Map Style

## Purpose

Give the theater a lighter, **classic** cartographic look (in place of the current dark
`#0e1116` basemap) over the same offline PMTiles vector source, and **remove the terrain
legend** panel — the first map-foundations step of v2 Wave 2. No data or behaviour change;
this is the visual base the rest of Wave 2 (framed grid, MGRS layout, accent/selection) builds on.

## Architecture

`buildBasemapStyle(pmtilesArchiveUrl)` (`src/map/basemapStyle.ts`) is the single, pure producer
of the MapLibre `StyleSpecification`. This feature only retunes its paint values to a light
classic palette — same source, same three layers (`background`, `areas`, `roads`), still **no
symbol/glyph layers** (offline constraint unchanged). The legend is a static DOM panel
(`TerrainLegend`, gated by the `terrainLegend` role-panel key); it is removed entirely.

## Data Model

None. (The H3 tile overlay colours in `overlays.ts` `TERRAIN_COLORS` are retuned in
`46-framed-map-and-hexes`, not here — this feature is the basemap only.)

## Business Rules

- **Classic light palette** (no external reference; values tunable in `basemapStyle.ts`):
  background a light parchment/neutral, water light blue, wood/forest light green, buildings
  light grey, other areas a neutral fill, roads a darker line for contrast on the light base.
- **Still offline-safe:** no `symbol` layers, no `glyphs` endpoint added; source stays
  `pmtiles://`. The pure-function/test split is preserved.
- **No legend:** `TerrainLegend` and its `.legend*` CSS are removed, and `terrainLegend` is
  removed from the `PanelKey` union + the OF4 role-panel set (no dangling key).

## API Endpoints

None.

## Data Flow

`reads-existing` — restyles the existing offline PMTiles basemap; consumes nothing new.

## Dependencies

None (first feature of the wave). `46`/`48` build on this light base.

## Security

None — pure client-side styling, no input, no network change.

## Known Issues

- Removed `frontend/src/components/TerrainLegend.tsx` (legend dropped) — intentional, not a missing source file.

## Bugs

(none yet — populated by /mdd bug when issues are reported)
