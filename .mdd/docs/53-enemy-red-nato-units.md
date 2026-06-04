---
id: 53-enemy-red-nato-units
title: Enemy Units — Red NATO Symbols
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-3
wave_status: active
depends_on: []
relates: [49-located-event-model]
source_files:
  - backend/app/domain/enemy_unit.py
  - backend/app/providers/enemy_units.py
  - backend/app/api/enemy_units.py
  - backend/app/config.py
  - backend/app/main.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/hooks/useTheaterData.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes:
  - GET /api/v1/enemy-units
models: []
test_files:
  - backend/tests/test_enemy_units.py
  - frontend/src/map/overlays.test.ts
data_flow: greenfield
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [enemy-units, app6, milsymbol, hostile, symbology, provider-factory]
path: Map/Units
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 53 — Enemy Units (Red NATO Symbols)

## Purpose

Render **enemy units as red NATO (APP-6 hostile) symbols** on the map, from a small **seeded stub**
behind the factory/provider (so the source stays swappable). Chatter-driven spawn is Wave 4; scenario
placement is Wave 7. Enemy units are a **separate, read-only** layer — not mixed into the orderable
friendly roster.

## Architecture

```
domain/enemy_unit.py     EnemyUnit (id, name, sidc, lat, lon, echelon?)
providers/enemy_units.py SeededEnemyUnitProvider (3 hostile units) / None; registry + factory
api/enemy_units.py       GET /api/v1/enemy-units → list[EnemyUnit]
config.py                enemy_unit_provider: "seed" | "none"
frontend client/types    getEnemyUnits(); EnemyUnit type
useTheaterData           fetches enemy units alongside the rest of the static world
overlays.ts              enemyUnitsToGeoJSON(enemies) → Point FeatureCollection (carries sidc)
MapView.tsx              'enemy-units' source + symbol layer; hostile SIDC → red milsymbol icon
```

Reuses the existing `symbols.ts`/`sidcToImage()` pipeline — a hostile SIDC renders red automatically
(milsymbol colours by standard identity). Kept off the friendly `units` source so enemy units are
**not selectable/orderable**.

## Data Model

`EnemyUnit` (Pydantic): `id`, `name`, `sidc` (20-digit hostile APP-6 — `1006…`, standard identity 6),
`lat`, `lon`, `echelon?`. Seeded set (Hohenfels): a mechanized-infantry company, an armor platoon, and
a recon section, with hostile SIDCs derived by flipping the friendly affiliation digit (`3`→`6`).

## API Endpoints

`GET /api/v1/enemy-units` → `EnemyUnit[]`. No auth, no params, in-memory (no DB) — the seed provider
returns the stub list directly.

## Business Rules

- Hostile SIDC = `1006` + `1000` + echelon(2) + entity(6) + `0000` (20 digits). milsymbol renders a
  red hostile frame.
- `none` provider returns `()` (tests/CI / clean demos).
- Enemy units are render-only this wave: no orders, no selection wiring.

## Data Flow

`SeededEnemyUnitProvider.units()` → `GET /enemy-units` → `client.getEnemyUnits()` → `useTheaterData`
→ `App` → `MapView.enemyUnits` → `enemyUnitsToGeoJSON` → `enemy-units` symbol layer (sidc → red icon
via `sidcToImage`, registered like friendly unit icons).

## Dependencies

None (greenfield provider + endpoint). Shares the `sidcToImage` rendering pipeline with the friendly
units feature.

## Security

None — read-only seeded data, no input.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
