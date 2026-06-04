---
id: 50-threat-mgrs-squares
title: Threat as MGRS Squares
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-3
wave_status: active
depends_on: [49-located-event-model]
relates: [47-mgrs-grid-layout, 51-event-hover-icons]
source_files:
  - frontend/src/map/mgrsGrid.ts
  - frontend/src/map/colors.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/map/mgrsGrid.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [threat, mgrs, maplibre, combat-events, symbology, overlays]
path: Map/Threat
integration_contracts: []
satisfies_contracts:
  - from: 49-located-event-model
    function: combat_event WS frame (zone + precision_m + estimated_threat)
    when: rendering each combatEvent as an MGRS square on the map
    status: done
    verified_at: "frontend/src/map/overlays.ts:98 (combatEventsToGeoJSON) + frontend/src/map/MapView.tsx:161 (combat-events-fill match on zone, opacity on estimated_threat)"
known_issues: []
---

# 50 — Threat as MGRS Squares

## Purpose

Render located combat events (from `49-located-event-model`) as **MGRS-grid-aligned squares** at
each event's `precision_m`, replacing flat per-hex threat as the primary threat read. Colour follows
the event `zone`: **combat → red**, **blocked → light-yellow**, **threat → graded by
`estimated_threat`**. Reuses the Wave-2 `mgrsGrid.ts` UTM math so squares snap to the same lattice as
the drawn grid.

## Architecture

```
mgrsGrid.ts   squareCornersFromCenter(lat, lon, precisionM) — snaps the event's UTM coords down to
              the precisionM lattice (zone 32U) and returns the cell's closed [lon,lat] ring
colors.ts     ZONE_COMBAT / ZONE_BLOCKED / ZONE_THREAT fill + outline colours (single source)
overlays.ts   combatEventsToGeoJSON(events) — Polygon FeatureCollection (one square per event)
MapView.tsx   'combat-events' source + 'combat-events-fill' + 'combat-events-outline' layers;
              effect keyed on props.combatEvents pushes setData
App.tsx       passes combatEvents={Object.values(combatEvents)} from useSimSocket
```

Pure square geometry lives in `mgrsGrid.ts`/`overlays.ts` (unit-tested without a canvas); MapView
only owns the imperative `setData` (the established once-init pattern).

## Data Model

Each combat event becomes a GeoJSON `Polygon` feature with properties:
`{ id, zone, estimated_threat, category, event, sender, precision_m }` (the last four carried for
the F3 hover/F4 chatter consumers, not styled here).

`squareCornersFromCenter(lat, lon, precisionM)` → closed ring of 5 `[lon,lat]` points: snap
`(e, n) = toUtm(lon, lat)` to `e0 = floor(e/p)*p`, `n0 = floor(n/p)*p`, emit the cell
`[e0, e0+p] × [n0, n0+p]` back through `toLonLat`. This places the event in its containing MGRS cell
at that precision (true "MGRS square"), not an arbitrary centred box.

## API Endpoints

None — consumes the existing `combat_event` WS frame via `useSimSocket().combatEvents`.

## Business Rules

- **Colour by zone** (`fill-color` MapLibre `match` on `['get','zone']`): `combat`→red,
  `blocked`→light-yellow, `threat`→amber; outline a darker shade of the same.
- **Opacity by threat**: `fill-opacity` interpolates `estimated_threat` 0→~0.18, 5→~0.5 so higher
  threat reads stronger; the combat red stays distinct from the existing hex `tiles-threat` wash.
- Squares are drawn **above** the basemap/grid but **below** routes/units so symbols stay legible.
- Empty `combatEvents` → empty FeatureCollection (no squares).

## Data Flow

`useSimSocket().combatEvents` (Record keyed by id) → `Object.values(...)` in App →
`MapView.combatEvents` prop → effect → `combatEventsToGeoJSON` → `setData('combat-events', …)`.
`squareCornersFromCenter` reuses the Wave-2 zone-32U `proj4` transforms in `mgrsGrid.ts`.

## Dependencies

`49-located-event-model` (the `combat_event` frame + `combatEvents` hook state). Reuses
`47-mgrs-grid-layout` UTM math.

## Security

None — pure client rendering of server-sent located events.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
