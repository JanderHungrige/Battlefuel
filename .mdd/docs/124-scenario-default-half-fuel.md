---
id: 124-scenario-default-half-fuel
title: Newly placed units default to half fuel
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-22
wave_status: active
depends_on: [123-scenario-force-placement]
relates: [123-scenario-force-placement]
source_files:
  - backend/app/services/force_placement.py
routes: []
models: []
test_files:
  - backend/tests/test_force_placement.py
  - backend/tests/test_placed_forces.py
data_flow: greenfield
last_synced: 2026-06-30
status: complete
phase: all
mdd_version: 11
tags: [scenario, fuel, placement, default]
path: Scenario/Placement
known_issues:
  - "Half-fuel applies to friendly placed units (which carry a fuel level). Placed red forces are render/threat-only (no fuel field), so the rule does not apply to them."
---

# 124 — Scenario default half-fuel

## Purpose

A unit dropped by the scenario creator ([[123-scenario-force-placement]]) starts at **half** its
fuel capacity, so a hand-built scenario begins with units that must plan refuelling — not full
tanks. This makes the fuel-logistics gameplay meaningful from the first placement.

## Implementation

`services.force_placement.HALF_FUEL_FRACTION = 0.5` and `half_fuel_for(unit_type)` →
`round(capacity_liters * 0.5, 1)` (0 for no-fuel / dismounted types). `place_unit_instance` sets the
new instance's `current_fuel_liters` to `half_fuel_for(unit_type)`. The fraction is the single
tunable; the rest of the placement is [[123-scenario-force-placement]].

## Tests

- `test_force_placement.TestHalfFuel` — `half_fuel_for` is exactly half capacity; `HALF_FUEL_FRACTION`
  is 0.5.
- `test_force_placement.TestPlaceUnitInstance` — a placed friendly unit's fuel equals `half_fuel_for`.
- `test_placed_forces` (db) — a placed 18 000 L armor company comes back with 9 000 L via the API.

## Verification

Covered by the F1 backend suites (pure + db), green. Visible on placement at the live `make dev`
gate (a freshly placed unit's fuel bar reads ~50 %).
