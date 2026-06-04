---
id: 59-retire-hex-ux
title: Retire Hex from the UX
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-9
wave_status: active
depends_on: [57-mgrs-inspect-panel, 58-mgrs-threat-shading]
relates: [47-mgrs-grid-layout, 23-ops-chatter-sectors]
source_files:
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
  - frontend/src/components/GridLayoutControl.tsx
  - frontend/src/components/ChatterLog.tsx
test_files: []
routes: []
models: []
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [mgrs, hex, cleanup, maplibre, ui]
path: Map/Inspect
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "Internal H3 data layer intentionally remains (tiles source is the click target + routing substrate). 'Sector' vocabulary kept (military term, not hex). Full backend H3→MGRS data migration is the deferred data wave."
---

# 59 — Retire Hex from the UX

## Purpose

Remove the last hex/H3 surface the operator sees, leaving an MGRS-only UX. The H3 data layer stays
internal (it is the invisible click target + the routing substrate).

## Architecture / Changes

- **Removed** the archived `GridLayout` type, the `gridLayout` prop, and the hex branch of the grid
  function — now `applyMgrsGrid(map, theater, precisionM)` (MGRS is the only grid).
- **Hidden** the H3 hex layers in the UX: `tiles-threat` (the hex threat wash — replaced by the
  Wave-9 `cell-threat` MGRS shading), `tiles-outline`; `tiles-fill` stays at opacity 0 only as the
  click target for cell resolution.
- **Replaced** the H3 hex `tiles-highlight` outline with a `sector-highlight` MGRS **square**: the
  chatter/supply/advice locate-highlight (`highlightH3`) now draws the square of the referenced
  location's MGRS cell (h3 centre → `squareCornersFromCenter`).
- **Vocabulary**: dropped the `H3` row from the inspect panel (doc 57); tidied hex-mentioning
  comments. "Sector" is kept (a military term, not hex).

## Business Rules

- MGRS is the only grid; no hex grid toggle.
- No hex geometry is drawn for the operator (threat = MGRS squares; locate = MGRS square).
- Internal H3 data layer remains (invisible) — the data/routing substrate.

## Data Flow

`highlightH3` (sector/supply/advice) → h3 centre (`cellToLatLng`) → `squareCornersFromCenter` →
`sector-highlight` square. Ambient threat → `cell-threat` (doc 58). Inspection → MGRS cell (doc 57).

## Dependencies

`57-mgrs-inspect-panel`, `58-mgrs-threat-shading` (must replace hex inspection + threat before
retiring the hex surface).

## Security

None.

## Known Issues

- Internal H3 data layer remains by design (click target + routing). Backend H3→MGRS data migration
  is the deferred data wave.

## Bugs

(none yet — populated by /mdd bug when issues are reported)
