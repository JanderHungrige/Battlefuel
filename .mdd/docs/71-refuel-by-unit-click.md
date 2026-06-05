---
id: 71-refuel-by-unit-click
title: Refuel by Unit Click (OF-8)
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: []
source_files:
  - frontend/src/lib/refuelOnClick.ts
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/refuelOnClick.test.ts
data_flow: reads-existing
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, refuel, unit-click, supply]
path: OF-8/Supply
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 71 — Refuel by Unit Click (OF-8)

## Purpose

In the OF-8 view, **clicking a unit starts its refuel flow** — an entry point in addition to
the supply panel's "Request refuel" dropdown.

## Architecture

The map's unit-click handler (App `onSelectUnit`) selects the unit as before, and — guarded by
the pure `shouldRefuelOnClick(role, refuelTargetIds, id)` — additionally calls the existing
`useSupplyOrders.placeRefuel(id)` when in OF-8 and the unit is a valid refuel target. The
recommendation then surfaces in the supply panel exactly as the dropdown path does.

## Business Rules

- Only fires in the OF-8 (supply) view; OF-4 unit clicks are unchanged (movement planning).
- Only fires for a refuel target — fuel trucks (and any non-target) are excluded, so clicking a
  tanker does not start a refuel.
- Reuses the existing refuel order/recommendation flow — no new endpoint or order type.

## Data Flow

Unit click → `shouldRefuelOnClick` gate → `placeRefuel(unitId)` → `POST /refuel-orders` →
recommendation in the supply panel (existing Wave-5 flow).

## Dependencies

- Wave-5 refuel flow (`useSupplyOrders.placeRefuel`) — reused.

## Known Issues

(none)

## Bugs

(none yet)
