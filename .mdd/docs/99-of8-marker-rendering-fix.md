---
id: 99-of8-marker-rendering-fix
title: OF-8 Selection & Locate Marker Rendering Fix
edition: MDD
initiative: battlefuel-v2
depends_on: []
relates: [29-of8-supply-ui]
source_files:
  - frontend/src/map/MapView.tsx
routes: []
models: []
test_files: []
data_flow: frontend
last_synced: 2026-06-23
status: complete
phase: all
mdd_version: 11
tags: [maplibre, markers, of8, selection-halo, locate-marker, z-order, icon-anchor]
path: Map/Markers
---

# 99 — OF-8 Selection & Locate Marker Rendering Fix

## Problem (two reported visual bugs)

1. **Purple locate ring offset + on top.** Clicking/locating a fuel unit or supply point in OF-8
   draws the purple `locate-marker` ring *above* the icon and offset from it. Cause: the
   `locate-marker` layer is added after the icon layers (so it paints on top), and the `depots`
   layer uses `icon-anchor: 'bottom'`, so the depot's geo-point — where the circle centres — sits
   at the bottom edge of the composited image (below the gauges), not on the NATO symbol.
2. **Selected-unit yellow halo pops on top after switching to OF-8.** Selecting a unit in OF-4 then
   switching to OF-8 dims the unit icon (`units` icon-opacity → 0.25 for OF-8 per-tab focus), but
   the `units-selected` yellow halo behind it stays at full opacity, so the full circle shows
   through the faded icon instead of peeking as a half-ring behind it.

## Fix (frontend, MapView only)

- **Z-order:** add the `locate-marker` layer *beneath* the unit/depot icons (`beforeId:
  'units-selected'`) so the ring frames the icon from behind instead of covering it.
- **Anchor:** change the `depots` icon-anchor from `bottom` to `center`, so a depot's geo-point is
  the icon's centre (consistent with the center-anchored unit/enemy symbols). The locate ring,
  centred on the same point, now frames the depot symbol.
- **Halo dimming:** in the OF-8 per-tab focus effect, dim the `units-selected` halo
  (`circle-opacity` / `circle-stroke-opacity`) with the same dimmed-id expression used for the
  unit icon, so a dimmed selected unit's halo fades proportionally and stays behind the icon.

## Verification

MapView is not unit-testable (jsdom has no WebGL; tests mock MapView), so these are pure MapLibre
layer-config changes verified at the live `make dev` gate: tsc + eslint + the full vitest suite
stay green, and the prod build compiles. Manual check: locate a depot in OF-8 (ring centred behind
the symbol), and select a unit then switch OF-4→OF-8 (halo fades behind the dimmed icon).
