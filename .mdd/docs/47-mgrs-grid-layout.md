---
id: 47-mgrs-grid-layout
title: Selectable MGRS Grid Layout (↔ Hex) with Precision & 1 m Readout
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-2
wave_status: active
depends_on: [46-framed-map-and-hexes]
relates: [45-classic-map-style]
source_files:
  - frontend/src/map/mgrsGrid.ts
  - frontend/src/components/GridLayoutControl.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
  - frontend/package.json
routes: []
models: []
test_files:
  - frontend/src/map/mgrsGrid.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [mgrs, grid, proj4, utm, map-layout, coordinates, offline]
path: Map/Grid
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 47 — Selectable MGRS Grid Layout

## Purpose

Add a **grid-layout setting** that switches the map between the **H3 hex grid** and an **MGRS
grid** (the default), with a **precision selector** for the drawn square size and an MGRS
**coordinate readout to 1 m** on hover — the centrepiece of v2 Wave 2.

## Architecture

- **`src/map/mgrsGrid.ts` (pure, unit-tested, no canvas):** `proj4` (lat/lon↔UTM 32N) + `mgrs`
  (lat/lon→MGRS string). Exports `GRID_PRECISIONS` (100 km/10 km/1 km/100 m), `DEFAULT_PRECISION_M`
  (1 km), `precisionToAccuracy`, `toMgrs(lat,lon,acc=5)` + `formatMgrs` (→ `32U QV 07524 55822`),
  `gridLines(bbox, precisionM)` → `[lon,lat][][]` polylines (UTM stepping), and
  `gridLabels(bbox, precisionM)` → `{lon,lat,label}[]` (per-square MGRS labels).
- **`GridLayoutControl`** — a small on-map control: layout toggle (MGRS ↔ Hex) + precision
  `<select>` (shown only in MGRS mode). State + `localStorage` persistence live in `App`; props
  flow to `MapView`.
- **`MapView`:** new `mgrs-grid` (line) and `mgrs-labels` (symbol, **canvas-rasterized**
  `icon-image` — same technique as unit symbols, so **no glyph pipeline**) sources/layers. An
  effect keyed on `[gridLayout, gridPrecisionM]` repaints the grid + labels and toggles the hex
  layers. **Hex layers are dimmed to opacity 0 (not `visibility:none`) when MGRS is active so a
  tile click still resolves to the underlying H3 cell.** A `mousemove` handler updates an MGRS
  **readout** box (`toMgrs(...,5)` → 1 m), shown in both layouts.

## Data Model

No backend/schema change. `package.json` gains `proj4` + `mgrs` (+ `@types/proj4`). MGRS is derived
client-side from lat/lon; the H3 tiles remain the authoritative data layer.

## Business Rules

- **Default layout = MGRS**, default drawn precision = **1 km**; persisted in `localStorage`.
- **Switch, not overlay:** MGRS active ⇒ hex fill/threat/outline at opacity 0 (still clickable);
  Hex active ⇒ mgrs grid/labels hidden.
- **Drawn precision** ∈ {100 km, 10 km, 1 km, 100 m}; finer levels are *not drawn* (would be solid).
- **Readout always to 1 m** (`accuracy 5`) regardless of drawn precision.
- **Click resolves the H3 tile** in either layout (the MGRS grid is a reference layer).
- Grid math assumes the theater is in **UTM zone 32U** (single zone).

## API Endpoints

None.

## Data Flow

`reads-existing` — consumes `theater.bbox` to generate the grid; no new data source.

## Dependencies

- `46-framed-map-and-hexes` — the framed viewport + hex layers this toggles against.

## Security

None — client-side coordinate math, no input beyond map interaction, no network.

## Known Issues

- Label decluttering at 100 m precision and zoom-dependent label visibility are deferred
  (Open Research in the wave doc); current labels render per square at the chosen precision.

## Bugs

(none yet — populated by /mdd bug when issues are reported)
