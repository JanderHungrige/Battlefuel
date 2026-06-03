---
id: 48-accent-and-selection-restyle
title: Accent Recolour & Selected-Unit Highlight
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-2
wave_status: active
depends_on: [45-classic-map-style]
relates: [46-framed-map-and-hexes]
source_files:
  - frontend/src/map/colors.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/map/colors.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [map, theme, accent, selection, maplibre, colors]
path: Map/Style
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 48 — Accent Recolour & Selected-Unit Highlight

## Purpose

Recolour the indicator accent from cyan (`#00e5cc`) to **#FFD9BD** across the UI and the map, and
give a **selected unit** a clear **darker-blue** highlight on the map (none exists today — selection
is only reflected in the inspect panel). Closing visual polish for v2 Wave 2.

## Architecture

- **Accent:** the UI accent is the `--accent` CSS custom property (`index.css`), used widely via
  `var(--accent)`. The map previously hardcoded the same cyan in three places in `MapView.tsx`
  (active-route line, route line, destination point). Centralise the **map** accent (and the new
  selected-unit colour) in a small `src/map/colors.ts` module so the values are single-sourced and
  unit-testable; `MapView` imports them instead of literals. `--accent` in `index.css` is updated in
  lockstep (CSS can't import the TS constant).
- **Selected unit:** add a `units-selected` circle layer on the existing `units` source, *below* the
  unit symbol, filtered to `selectedUnitId` (new `MapView` prop, passed from `App`), painted a
  darker blue halo. An effect keyed on `selectedUnitId` updates the filter (mirrors the existing
  `highlightH3` → `tiles-highlight` effect).

## Data Model

New `src/map/colors.ts`: `ACCENT = '#FFD9BD'`, `SELECTED_UNIT = '#1d4ed8'` (darker blue),
`SELECTED_UNIT_RING = '#1e3a8a'`. No API/schema change.

## Business Rules

- **Accent = #FFD9BD** everywhere the old cyan appeared: `--accent` CSS var + the 3 map literals
  (now `ACCENT` from `colors.ts`).
- **Selected unit** shows a darker-blue halo under its APP-6 icon while `selectedUnitId` is set;
  clears when selection clears. The icon itself is unchanged (still on top).
- Selection highlight is purely visual; click→select behaviour is unchanged.

## API Endpoints

None.

## Data Flow

`reads-existing` — `selectedUnitId` already lives in `App` state; this feature threads it into
`MapView` for the highlight. No new data.

## Dependencies

- `45-classic-map-style` — accent/selection colours are chosen against the light base.

## Security

None.

## Known Issues

(none)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
