---
id: 55-mgrs-cell-index
title: MGRS Cell Index
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-9
wave_status: active
depends_on: [47-mgrs-grid-layout]
relates: [50-threat-mgrs-squares, 56-mgrs-cell-aggregation]
source_files:
  - frontend/src/map/mgrsGrid.ts
routes: []
models: []
test_files:
  - frontend/src/map/mgrsGrid.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [mgrs, grid, cell, inspection, utm, pure]
path: Map/Inspect
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 55 — MGRS Cell Index

## Purpose

Pure helpers to identify the **MGRS cell** a point falls in at a given precision, and a stable
**cell id** for grouping. The foundation for MGRS-cell inspection (`56`/`58`): every clicked point
and every data tile maps to a cell id so tiles can be aggregated per cell.

## Architecture

Extends the Wave-2 `mgrsGrid.ts` pure module (proj4 zone-32U transforms), no canvas:
- `cellIdFor(lat, lon, precisionM)` — snap the point's UTM easting/northing **down** to the
  `precisionM` lattice and return a stable id `"<precisionM>:<e0>:<n0>"` (same lattice the grid +
  `squareCornersFromCenter` use, so the id matches the drawn square).
- `cellMgrsLabel(lat, lon, precisionM)` — the formatted MGRS coordinate of the cell centre, for the
  inspect panel header.

## Data Model

Cell id is a string keyed by the snapped SW corner + precision (robust for non-decade precisions
like 2 km / 5 km, where an MGRS digit-string can't uniquely name the cell). Two points in the same
cell yield the same id; the same point at a coarser precision yields a different id.

## API Endpoints

None — pure frontend utilities.

## Business Rules

- `cellIdFor` is deterministic and lattice-aligned (matches `squareCornersFromCenter`).
- `cellMgrsLabel` uses the cell **centre** so all points in a cell share one label.

## Data Flow

Consumed by `56-mgrs-cell-aggregation` (group tiles by `cellIdFor(tile centre)`) and
`58-mgrs-inspect-panel` (resolve the clicked cell + show `cellMgrsLabel`).

## Dependencies

`47-mgrs-grid-layout` (the zone-32U UTM math in `mgrsGrid.ts`).

## Security

None — pure math.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
