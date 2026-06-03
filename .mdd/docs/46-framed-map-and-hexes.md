---
id: 46-framed-map-and-hexes
title: Framed Theater Viewport & Crisp Hex Grid
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-2
wave_status: active
depends_on: [45-classic-map-style]
relates: [47-mgrs-grid-layout, 48-accent-and-selection-restyle]
source_files:
  - frontend/src/map/MapView.tsx
  - frontend/src/map/overlays.ts
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [map, maplibre, viewport, maxbounds, hex-grid, h3, terrain-colors]
path: Map/Grid
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 46 — Framed Theater Viewport & Crisp Hex Grid

## Purpose

Frame the map to the theater (so the operator can't pan off into empty space) with a visible
border, and make the H3 hexes read **crisp and non-overlapping** on the new light base — the
second map-foundations step of v2 Wave 2.

## Architecture

- **Framing:** the map is currently created unbounded (`center`/`zoom` only). Add `maxBounds`
  derived from `theater.bbox` via a pure `paddedBounds(bbox, padDeg)` helper in `overlays.ts`
  (so it is unit-testable without the canvas), passed into the `maplibregl.Map` constructor in
  `MapView.tsx`. A small degree pad keeps the theater edge off the viewport border.
- **Frame border:** a CSS border/inset on the map container (`.map-area`) so the theater sits
  visibly framed.
- **Crisp hexes:** retune the light hex palette (`TERRAIN_COLORS` in `overlays.ts`) to soft tints
  that read on the parchment base, and sharpen the `tiles-outline` layer (colour/width/opacity in
  `MapView.tsx`) so adjacent hexes are clearly bounded rather than blending. Tile fill opacity
  tuned for the light base. Boundary rings are already closed by `tilesToGeoJSON` (no geometry
  change).

## Data Model

`TERRAIN_COLORS: Record<TerrainType, string>` retuned to a light classic terrain palette. No
schema or API change. New pure helper `paddedBounds(bbox, padDeg)` → `[[w,s],[e,n]]`.

## Business Rules

- **maxBounds** = theater bbox padded by `padDeg` (default ~0.01°); panning is constrained to it.
- **Initial view** unchanged (`theater.center_*` / `default_zoom`), now clamped by `maxBounds`.
- **Crisp hexes:** outline visibly separates neighbours on the light base; fills are light tints,
  threat overlay still ramps red on top, click-highlight (yellow) unchanged.
- Hex tiles remain the **data-carrying** layer (terrain/threat); this is visual tuning only.

## API Endpoints

None.

## Data Flow

`reads-existing` — consumes `theater.bbox` (already loaded by `useTheaterData`) for `maxBounds`;
re-tints the existing tile overlay. No new data.

## Dependencies

- `45-classic-map-style` — the light base these hex tints + outline are tuned against.

## Security

None.

## Known Issues

(none)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
