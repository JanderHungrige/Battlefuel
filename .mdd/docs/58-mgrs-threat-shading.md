---
id: 58-mgrs-threat-shading
title: MGRS-Cell Threat Shading
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-9
wave_status: active
depends_on: [55-mgrs-cell-index, 56-mgrs-cell-aggregation]
relates: [50-threat-mgrs-squares, 59-retire-hex-ux]
source_files:
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
test_files:
  - frontend/src/map/overlays.test.ts
routes: []
models: []
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [mgrs, threat, shading, maplibre, cell, migration]
path: Map/Threat
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 58 — MGRS-Cell Threat Shading

## Purpose

Render **ambient threat as shaded MGRS cells** instead of the hex (H3) threat wash — the "Hybrid,
threat-first" migration. Aggregate each MGRS cell's max tile threat and shade that square red by
intensity, so the operator sees an MGRS-native threat overview with no hexagons.

## Architecture

```
overlays.ts   cellThreatToGeoJSON(tiles, precisionM) → one red Polygon per cell with maxThreat > 0
              (group by cellIdFor, max threat per cell, square via squareCornersFromCenter)
MapView.tsx   'cell-threat' fill layer (opacity ramped by threat) fed from displayed tiles + active
              precision; the hex 'tiles-threat' wash is hidden (replaced).
```

Client-side, reusing the W9 cell math (`55`) + threat aggregation idea from (`56`); live because it
reads the displayed (tile_update-merged) tiles.

## Data Model

Each cell with `maxThreat > 0` → a Polygon feature with `{ threat }`. Threat-0 cells are omitted
(transparent), matching the old wash.

## Business Rules

- One square per MGRS cell at the active precision; fill red, opacity `interpolate(threat, 0→0,
  1→0.12, 5→0.55)` (same ramp as the retired hex wash).
- Drawn below the Wave-3 combat-event squares (event squares + icons stay on top).
- Recomputes when the displayed tiles or the precision change.

## Data Flow

`displayedTiles` + `gridPrecisionM` → `cellThreatToGeoJSON` → `cell-threat` source/layer. The hex
`tiles-threat` layer is hidden (see `59-retire-hex-ux`).

## Dependencies

`55-mgrs-cell-index` (cellIdFor + squareCornersFromCenter), `56-mgrs-cell-aggregation` (threat max).

## Security

None — client rendering.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
