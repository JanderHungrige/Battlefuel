---
id: 120-threat-grid-decoupled-render
title: Threat renders at its own grid size, decoupled from the displayed grid
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-21
wave_status: active
depends_on: [119-threat-grid-code-model]
relates: [119-threat-grid-code-model, 122-enemy-danger-circle-render]
source_files:
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/map/threatGrid.ts
routes: []
models: []
test_files:
  - frontend/src/map/overlays.test.ts
  - frontend/src/map/threatGrid.test.ts
data_flow: writes-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [threat, render, mgrs, grid, decoupled, highest-wins, maplibre]
path: Threat/Render
known_issues:
  - "The cell-threat fill layer draws overlapping squares with per-feature opacity, so a small high-threat square over a larger low-threat one reads as slightly more intense red in the overlap (two semi-transparent reds) rather than a hard replace. This reinforces highest-wins visually; a hard base-cell replace was judged unnecessary. Verified at the live make dev gate (jsdom mocks MapView)."
---

# 120 — Threat grid-decoupled render

## Purpose

Fix the long-standing bug where the ambient-threat wash was tied to the **displayed** MGRS grid:
resizing the grid (1 km ↔ 500 m ↔ 2 km) rescaled the threat. Threat now paints at **its own grid
code** ([[119-threat-grid-code-model]]) — a 500 m threat colours its 500 m square even on the 1 km
grid (¼ of the displayed cell), and overlapping threats nest **highest-wins**.

## Change

`cellThreatToGeoJSON(tiles)` (was `cellThreatToGeoJSON(tiles, precisionM)`) now builds its squares
from `threatSquares(tiles)`:

- Each threatened tile emits **one square at its own `precisionM`** (its located-event precision, or
  the 1 km ambient default), via `squareCornersFromCenter(lat, lon, precisionM)`.
- Squares are **sorted ascending by threat level**, so the MapLibre `cell-threat` fill layer (which
  draws features in source order) paints a higher-threat square **over** a lower one — highest-wins
  nesting on screen (a 500 m level-4 patch shows through a 2 km level-2 area).
- Each feature still carries `threat` for the existing opacity ramp; the layer paint is unchanged.

`MapView` drops `gridPrecisionM` from the call sites and from the cell-threat update effect's
dependency list, so **resizing the grid no longer re-renders or rescales threat**. The `mgrs-grid`
layer still uses `gridPrecisionM` for the coordinate grid itself.

## Incidental fix

`MapView.tsx` line ~943 carried a stray **NUL byte** inside the `unit-fuel-bars` filter fallback
(`p.selectedUnitId ?? '<NUL>'`), which made `grep`/`rg` treat the file as binary and meant an
unselected state filtered against a 1-char NUL string. Corrected to `?? ''`.

## Tests

- `overlays.test.ts` — updated for the new signature; new case asserts a located 500 m threat paints
  a geometrically **smaller** square (smaller lon-span) than the 1 km ambient default — the decoupling.
- `threatGrid.test.ts` (from F1) — dedupe-to-max per cell, separate own-size squares for nested grid
  codes, ascending sort for paint order.

## Verification

Unit tests green; type-check + lint clean. Visual decoupling (resize grid → threat squares hold
their size; nested patch shows through) is confirmed at the live `make dev` → `:3001` → `:3000` gate.
