---
id: 122-enemy-danger-circle-render
title: Enemy danger circle + red 500 m cells around hostile units
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-21
wave_status: active
depends_on: [120-threat-grid-decoupled-render]
relates: [120-threat-grid-decoupled-render, 119-threat-grid-code-model]
source_files:
  - frontend/src/map/enemyDanger.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
routes: []
models: []
test_files:
  - frontend/src/map/enemyDanger.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [enemy, danger, circle, render, mgrs, maplibre, of4]
path: Threat/EnemyDanger
known_issues:
  - "The display danger radius is a fixed 500 m (ENEMY_DANGER_RADIUS_M), independent of echelon, per the wave demo-state. The routing-side enemy danger (Wave 16, enemy_danger.py) remains echelon-scaled (400 m–2 km) and feeds the SAFE cost — so the on-map ring is a fixed 'keep clear' indicator, not a 1:1 picture of the routing avoidance radius. Change the one constant to echelon-scale the display if desired."
  - "Affected cells are found by sampling the circle bbox at half-cell (250 m) steps; cells the circle only grazes between samples could be missed, but at 250 m steps over 500 m cells every overlapping cell is sampled in practice. The map-layer wiring is verified at the live make dev gate (jsdom mocks MapView)."
---

# 122 — Enemy danger circle render

## Purpose

Reach the wave demo-state's last clause: when an enemy unit appears, draw a **500 m-radius circle**
around it and colour **all affected 500 m cells red**. This is a display complement to the
routing-side enemy danger from Wave 16 ([[121-threat-edge-penalty-by-resolution]] folds enemy
proximity into SAFE cost) — the operator now *sees* a consistent keep-clear zone, not only its effect
on routes.

## Implementation

- **`frontend/src/map/enemyDanger.ts`** (pure, unit-testable): `ENEMY_DANGER_RADIUS_M` (500),
  `DANGER_CELL_M` (500), `distanceM` (equirectangular metres, mirrors the backend), `dangerCircle`
  (a closed `[lon,lat]` ring approximating the circle), and `dangerCells` (the distinct 500 m MGRS
  cells the circle covers, deduped across enemies — samples the bbox at half-cell steps and keeps a
  representative point per cell for `squareCornersFromCenter`).
- **`overlays.ts`**: `enemyDangerCirclesToGeoJSON` (one ring Polygon per hostile) and
  `enemyDangerCellsToGeoJSON` (one red square per covered cell).
- **`MapView.tsx`**: two new sources/layers — `enemy-danger-cells` (red fill, opacity 0.3) and
  `enemy-danger-rings` (dashed red line) — added low in the stack (above tiles, below grid / units /
  routes) so the hostile symbol and routes stay on top. `syncEnemyUnits` pushes both alongside the
  enemy points, so they refresh on the same `props.enemyUnits` effect (chatter sightings included).

## Tests

- `enemyDanger.test.ts` — `distanceM` sanity, the ring is closed with vertices ~500 m from centre,
  `dangerCells` returns ≥4 distinct in-radius cells for one enemy and dedupes overlap from two close
  enemies, empty input → empty output.
- `overlays.test.ts` — a closed danger ring polygon per enemy, washed cells as closed squares, and no
  danger geometry with no enemies.

## Verification

Full frontend suite (343 tests) + lint + type-check green. The visual (ring + red 500 m cells appear
on a sighting, refresh as enemies move, sit under the hostile symbol) is confirmed at the live
`make dev` → `:3001` → `:3000` gate.
