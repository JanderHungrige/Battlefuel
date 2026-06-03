---
id: 54-depot-nato-symbol-fuelbars
title: Depot NATO Symbol + Fuel Gauges
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-3
wave_status: active
depends_on: []
relates: [24-fuel-supply-model, 29-of8-supply-ui]
source_files:
  - frontend/src/map/depotSymbol.ts
  - frontend/src/map/symbols.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/map/depotSymbol.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [depot, app6, milsymbol, fuel, sustainment, of8, symbology]
path: Map/Units
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 54 — Depot NATO Symbol + Fuel Gauges

## Purpose

Replace the plain amber depot circle with the **correct APP-6 sustainment symbol** plus **per-fuel
4-segment fill gauges** (diesel + JP8), each segment filled by `quantity_liters / capacity_liters`
from the existing `FuelStock` data. No schema change — reads the OF-8 supply overview that already
carries per-depot stocks.

## Architecture

```
depotSymbol.ts   pure: filledSegments(q,c), depotGauges(stocks) → {diesel,jp8} (0–4 each),
                 depotIconKey(depotFuel) (stable per fill → image reuse)
symbols.ts       sidcToCanvas(sidc) helper (reuses milsymbol) for compositing
overlays.ts      depotsToGeoJSON now takes DepotFuel[] and emits an `icon` (the gauge key) per depot
MapView.tsx      depotImage(depotFuel) composites the sustainment SIDC + two 4-seg bars to a canvas;
                 'depots' becomes a symbol layer (icon-image ['get','icon']); syncDepots registers
                 one image per distinct fill signature
App.tsx          passes supply.overview.depots (DepotFuel[]) instead of bare FuelDepot[]
```

Canvas-composited icon (same offline technique as unit SIDCs / MGRS labels / event glyphs), so it
needs no glyph PBF and updates as fuel changes (the icon key encodes the fill).

## Data Model

`depotGauges(stocks)` sums quantity/capacity per fuel type and returns filled-segment counts
`{ diesel: 0–4, jp8: 0–4 }` via `filledSegments(q, c) = clamp(round(q/c · 4), 0, 4)`. Fuel-type match
is case-insensitive (`diesel`, `jp8`). `depotIconKey = depot:<diesel>-<jp8>` so depots with the same
fill share one registered image.

## API Endpoints

None — reads `GET /api/v1/supply/overview` (already provides `depots: DepotFuel[]`).

## Business Rules

- Depot symbol: a friendly APP-6 sustainment/fuel-supply SIDC (`10031000001406000000`).
- Two stacked 4-segment bars under the symbol: diesel (green) and JP8 (amber); filled segments =
  `filledSegments(sum quantity, sum capacity)`.
- Empty capacity → 0 filled (no divide-by-zero). Over-full clamps to 4.
- Depot overlay still gated to the OF-8 role (`depotOverlay`) — unchanged.

## Data Flow

`useSupply().overview.depots` (DepotFuel[]) → App → `MapView.depots` → `syncDepots` registers a
composited image per `depotIconKey` → `depotsToGeoJSON` points reference it → 'depots' symbol layer.
Buy-order deliveries bump `supplyTick` → overview refetch → new fill → new icon.

## Dependencies

None on other Wave-3 features. Reads the Wave-5 supply model (`24-fuel-supply-model`,
`29-of8-supply-ui`).

## Security

None — client rendering of supply data.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
