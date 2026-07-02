---
id: 126-multi-tile-threat-select
title: Shift/Ctrl multi-select tiles to set threat in one action
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-22
wave_status: active
depends_on: []
relates: [119-threat-grid-code-model]
source_files:
  - frontend/src/lib/multiCellSelect.ts
  - frontend/src/components/MultiCellThreatPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/multiCellSelect.test.ts
  - frontend/src/components/MultiCellThreatPanel.test.tsx
data_flow: writes-existing
last_synced: 2026-06-30
status: complete
phase: all
mdd_version: 11
tags: [scenario, threat, multi-select, mgrs, tiles, of4]
path: Scenario/Threat
known_issues:
  - "Batch set issues one PATCH /tiles/{h3} per H3 tile in the selection (the existing onMutateCell loop) — no bulk endpoint. Fine for hand-built scenarios; a bulk endpoint could be added if selections get large."
  - "Selection is keyed on the MGRS cell at the current displayed precision; changing the grid size mid-selection keeps the already-picked cells (their stored lat/lon) but re-derives membership at the new precision. The map/keyboard wiring is verified at the live make dev gate (jsdom mocks MapView)."
---

# 126 — Multi-tile threat select

## Purpose

Let the operator hold **Shift or Ctrl** (or Cmd) and click multiple MGRS cells, then set their
**threat level in one action** — instead of editing tiles one at a time. The selection respects the
displayed grid resolution (the Wave 21 MGRS-cell index, [[119-threat-grid-code-model]]).

## Implementation (frontend-only)

The backend already supports it: `onMutateCell(h3Indexes[], mutation)` loops `PATCH /tiles/{h3}` over
an array. F4 adds the selection UX:

- **`lib/multiCellSelect`** (pure): `toggleCell(cells, cell, precisionM)` adds/removes a cell by its
  MGRS id; `cellsToH3Indexes(cells, tiles, precisionM)` collects every H3 tile in the selected cells.
- **`MapView`**: a cell click now passes an `additive` flag (`originalEvent.shiftKey || ctrlKey ||
  metaKey`). A `multi-cells` source/layer outlines + lightly fills the selected squares.
- **`App`**: an additive click toggles the cell into `multiCells`; a plain click clears it and
  single-selects (inspect). `multiCellH3` is the union of H3 tiles across the selection.
- **`MultiCellThreatPanel`**: shows the cell count and 0–5 buttons that call
  `onMutateCell(multiCellH3, { threat_level })` — setting every selected tile at once. The `tile_update`
  WS echoes refresh the map (and the Wave 21 threat render/cost follow).

## Tests

- `multiCellSelect.test` — toggle add/remove/distinct; H3 union for one and multiple cells, deduped.
- `MultiCellThreatPanel.test` — count pluralisation, `onSetThreat` with the level, clear.

## Verification

Frontend 363 vitest + tsc + eslint + prod build green. Shift/Ctrl-selecting several cells and setting
a threat across all of them is confirmed at the live `make dev` gate.
