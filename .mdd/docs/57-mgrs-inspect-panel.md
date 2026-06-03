---
id: 57-mgrs-inspect-panel
title: MGRS-Cell Inspect Panel
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-9
wave_status: active
depends_on: [55-mgrs-cell-index, 56-mgrs-cell-aggregation]
relates: [10-map-overlays-inspect, 22-obstacle-tile-ops-ui]
source_files:
  - frontend/src/components/InspectPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/components/InspectPanel.test.tsx
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [mgrs, inspect, panel, cell, maplibre, ui]
path: Map/Inspect
integration_contracts: []
satisfies_contracts:
  - from: 56-mgrs-cell-aggregation
    function: aggregateCell(tiles)
    when: building the clicked cell's situation for the panel
    status: done
    verified_at: "frontend/src/App.tsx (selectedCellInfo memo → aggregateCell over tiles in the clicked cell)"
known_issues: []
---

# 57 — MGRS-Cell Inspect Panel

## Purpose

Make map inspection **MGRS-cell-native**: clicking the map selects the MGRS cell at the current grid
precision and the panel shows its **MGRS coordinate** + **aggregated situation** (max threat, worst
road, max intel, dominant terrain, tile count) + **units in the cell** — replacing the per-H3-tile
display (no `H3` row). Sector editing is kept but applied **cell-wide** (to all tiles in the cell).

## Architecture

```
App.tsx           selectedCell {lat,lon} state (replaces selectedTileH3); selectedCellInfo memo
                  (cellIdFor groups displayed tiles + units into the clicked cell → aggregateCell +
                  cellMgrsLabel); onMutateCell applies a mutation to every tile in the cell.
MapView.tsx       background click → onSelectCell(lat,lon) (was onSelectTile(h3)); a 'selected-cell'
                  line layer outlines the chosen MGRS square (squareCornersFromCenter).
InspectPanel.tsx  `cell?: InspectCell` section (replaces `tile?`); CellEdit → onMutateCell.
```

Aggregation is **client-side** over the live displayed tiles (already merged with `tile_update`), so
the panel reflects live data without a round-trip.

## Data Model

`InspectCell = { mgrs: string; situation: CellSituation; h3Indexes: string[]; units: {id,name}[] }`.
`h3Indexes` is the set of underlying tiles (for cell-wide edits); `situation` from `aggregateCell`.

## API Endpoints

None (client-side). Cell edits reuse the existing per-tile mutation (`useObstacleOps.mutateTile`)
applied across `h3Indexes`.

## Business Rules

- Click resolves the cell from the click lat/lon at the **active grid precision**.
- Panel shows MGRS coordinate, threat `n/5` (max), terrain (dominant), road (worst), intel (max),
  tile count, and the names of units in the cell. **No H3/hex vocabulary.**
- Cell edit (threat / road / situation / note) applies to **all** tiles in the cell.
- Single-focus with the Wave-3 combat-square + chatter highlights (selecting a cell clears those,
  and vice-versa) — closing the panel (`clear`) clears the selected-cell highlight.

## Data Flow

MapView click → `onSelectCell(lat,lon)` → App `selectedCell` → `selectedCellInfo`
(`cellIdFor`+`aggregateCell`+`cellMgrsLabel`, units filtered by cell) → `InspectPanel cell=` +
MapView `selected-cell` square highlight. Cell edit → `onMutateCell(h3Indexes, mutation)` →
`mutateTile` per tile.

## Dependencies

`55-mgrs-cell-index`, `56-mgrs-cell-aggregation`.

## Security

None — client rendering + existing authenticated-free tile mutation (single-user, server-authoritative).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
