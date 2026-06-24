---
id: 99-of8-marker-rendering-fix
title: OF-8 Selection & Locate Marker Rendering Fix
edition: MDD
initiative: battlefuel-v2
depends_on: []
relates: [29-of8-supply-ui]
source_files:
  - frontend/src/map/MapView.tsx
  - frontend/src/map/colors.ts
  - frontend/src/App.tsx
  - frontend/src/components/SupplyPanel.tsx
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

## Follow-up round (locate halo polish)

Further OF-8 feedback on the purple locate marker, fixed together:

- **Looked weak / sat low.** The locate marker now mirrors the selected-unit halo exactly —
  radius 18, `circle-opacity` 0.55, 2.5 px stroke — in purple (`LOCATE_HALO` / `LOCATE_HALO_RING`
  in `colors.ts`) instead of a small thin ring.
- **Depot ring sat below the symbol.** Centre-anchoring the depot put the *image* centre on the
  point, but the image centre is 7.5 px below the NATO-symbol centre (the gauges hang below). Added
  `icon-offset: [0, 7.5]` to the `depots` layer so the symbol — not the gauges — sits on the point;
  trucks (center-anchored, no gauges) were already correct.
- **Halo stayed bright when its entity was dimmed** (depot on the supply-fleet tab; truck on the
  order-fuel tab). The locate state now tracks the entity `{kind, id}` (App + `SupplyPanel.onLocate`
  now pass `'depot'|'truck'` + id), App derives `locateDimmed`, and MapView fades the
  `locate-marker` opacity to match — same treatment as the selected-unit halo.
- **Deleting the located depot left the halo on the map.** `removeDepot` now clears the located
  entity when the deleted depot is the one marked.

## Verification

MapView is not unit-testable (jsdom has no WebGL; tests mock MapView), so the layer-config changes
are verified at the live `make dev` gate; the App/SupplyPanel wiring is covered by the updated
SupplyPanel locate tests. tsc + eslint + the full vitest suite (278) stay green and the prod build
compiles. Manual check: locate a depot in OF-8 (purple halo framing the symbol, behind it); switch
to the supply-fleet tab (halo fades with the dimmed depot); locate a truck then switch to the
order-fuel tab (halo fades with the dimmed truck); delete a located depot (halo clears).
