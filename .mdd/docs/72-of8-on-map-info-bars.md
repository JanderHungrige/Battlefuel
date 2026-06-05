---
id: 72-of8-on-map-info-bars
title: OF-8 On-Map Per-Unit Fuel Bars
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: []
source_files:
  - frontend/src/map/unitFuelBar.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/map/unitFuelBar.test.ts
data_flow: reads-existing
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, map, fuel-bar, optics, maplibre, units]
path: OF-8/Map
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 72 — OF-8 On-Map Per-Unit Fuel Bars

## Purpose

In the OF-8 view, draw a single **colour-coded fuel bar** next to each unit (like the depot
gauges) — **fuel only** (ammo dropped). Overlapping bars render the **selected unit's bar on
top**, and a **toggle** enables/disables the on-map info bars.

## Architecture

A pure `unitFuelBar.ts` computes the fuel fraction (live `fuel_l` from the unit_update frame, or
the instance's `current_fuel_liters`, over the unit type's capacity), its colour (green/amber/
red), and a bucketed icon cache key. MapView renders a small bar image per fill bucket on a
`unit-fuel-bars` GeoJSON source via **two symbol layers** off one source — a main layer
(excluding the selected unit) and a `unit-fuel-bars-selected` layer (only the selected unit,
drawn on top). The bar is offset below the unit symbol. A `showUnitFuelBars` prop gates
rendering; App exposes a "Fuel bars" toggle in the OF-8 toolbar.

## Business Rules

- Fuel only — no ammo bar / no ammo model (requester 2026-06-05).
- A unit with no fuel telemetry (`current_fuel_liters` null and no live `fuel_l`) gets no bar.
- Colour: green > 50%, amber 25–50%, red < 25%. Width is proportional to the fraction.
- Bars are bucketed (0–10) so a bounded set of icon images is registered.
- The selected unit's bar is rendered by a dedicated top layer so it is never hidden by
  overlapping neighbours.
- Toggling the control off clears the bars source (no bars rendered).

## Data Flow

`current_fuel_liters` / live `fuel_l` + unit-type capacity → `fuelFraction` → `fuelBarKey` →
`unit-fuel-bars` features → MapView symbol layers.

## Dependencies

- Existing unit rendering + live positions (Wave 1–3) — bars sit beside the same units.

## Known Issues

(none)

## Bugs

(none yet)
