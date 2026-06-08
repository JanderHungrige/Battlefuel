---
id: 66-order-fuel-rename-and-dropdown-bug
title: Order Fuel — Rename + Initial Dropdown Bug Fix
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: []
source_files:
  - frontend/src/components/SupplyPanel.tsx
routes: []
models: []
test_files:
  - frontend/src/components/SupplyPanel.test.tsx
data_flow: reads-existing
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, supply, order-fuel, buy-order, dropdown-bug, react]
path: OF-8/Supply
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 66 — Order Fuel: Rename + Initial Dropdown Bug Fix

## Purpose

Fix the OF-8 "Buy fuel" bug where the **initial / default** Main Supply Point has an
empty fuel dropdown, leaving the order button greyed out until the operator selects a
*different* supply point. Also rename the user-facing copy "Buy fuel" → "Order fuel"
throughout the OF-8 supply view (the first feature of the Wave-11 order-fuel chain).

## Architecture

Frontend-only change in `SupplyPanel.tsx`. The supply data (`depots`, `overview`) flows
in from `useSupply`; the panel owns the local selection state for the order form.

## Business Rules

- **Root cause:** `buyDepot` is initialised once from `depots[0]?.id` at first render. On
  first render `depots` is `[]` (still loading) so `buyDepot = ''`. When `depots`/`overview`
  arrive, `useState` does **not** re-initialise, so `buyDepot` stays `''`,
  `fuelOptions` (derived from `overview.depots.find(id === buyDepot)`) stays `[]`, and the
  submit button stays disabled. Selecting any real depot updates `buyDepot` and unblocks it.
- **Fix:** mirror the existing `effectiveFuel` fallback pattern with an `effectiveDepot`
  that falls back to `depots[0]?.id` whenever the stateful `buyDepot` is not a current
  depot id. Derive `fuelOptions`, the depot `<select value>`, and the `onBuy` call from
  `effectiveDepot`. No effects required — selection is always valid even before the user
  touches the control.
- **Rename:** all visible "Buy fuel" copy in the OF-8 view becomes "Order fuel"
  (section heading + submit button label). `data-testid`s remain stable (`buy-depot`,
  `buy-fuel`, `buy-submit`) so existing tests and downstream features keep working.

## Data Flow

- `depots` / `overview`: computed by backend supply provider → `GET /api/v1/depots`,
  `GET /api/v1/supply/overview` → `useSupply` → `SupplyPanel` props (no transformation).
- Selection (`effectiveDepot`, `effectiveFuel`, `buyQty`) is local panel state passed up
  via `onBuy(depotId, fuelType, quantityLiters)` → `useSupplyOrders.placeBuy`.

## Dependencies

None (first feature in the wave; later order-fuel features build on this panel).

## Known Issues

(none)

## Bugs

(none yet)
