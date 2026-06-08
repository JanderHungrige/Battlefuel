---
id: 70-logistic-sites
title: Typed Stocked Logistic Sites + Low-Fuel Proposal
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: []
source_files:
  - backend/app/domain/supply.py
  - backend/app/models/supply.py
  - backend/app/providers/supply.py
  - backend/app/api/supply.py
  - backend/app/services/redistribution.py
  - backend/app/api/advice_redistribution.py
  - backend/alembic/versions/0014_add_depot_site_type.py
  - frontend/src/lib/logisticSite.ts
  - frontend/src/components/SupplyPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/depots
  - GET /api/v1/advice/site-refuel/{depot_id}
models:
  - fuel_depots
  - fuel_stocks
test_files:
  - backend/tests/test_supply.py
  - backend/tests/test_redistribution.py
  - frontend/src/lib/logisticSite.test.ts
data_flow: writes-existing
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, logistic-sites, ajp-4.6, jlsg, redistribution, depot, fuel-stock]
path: OF-8/Supply
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 70 — Typed Stocked Logistic Sites + Low-Fuel Proposal

## Purpose

Grow the W10 "add depot" marker into a **typed, stocked, advisable logistic site**. Supply
points become **clickable to locate on the map**; the operator can add **NATO JLSG site types**
(AJP-4.6): **BSA, CSSBN, DOB, FLS, TLB**. Typed sites **carry fuel stock** (reuse `FuelStock`)
and are **refuelable**; when a site runs **low** it **proposes a refuel/redistribution order**
via the Wave-6 redistribution advisor.

## Architecture

`fuel_depots` gains a nullable `site_type`. Creating a typed site (extended `POST /depots`)
seeds default diesel/JP8 `FuelStock` rows so the site is stocked and refuelable (buy orders
target existing stock rows). A site-refuel proposal reuses the Wave-6 `redistribution_plan`,
filtered to one site (`GET /advice/site-refuel/{depot_id}`). Frontend adds a site-type picker
to the add-depot flow, click-to-locate on depots, and a low-site "Propose refuel" affordance.

## Data Model

`fuel_depots.site_type` (str, nullable): one of `bsa`, `cssbn`, `dob`, `fls`, `tlb`, or null
for a plain depot. Typed sites are seeded with default stock:
- diesel: 5,000 / 20,000 L  (≈25% → below the 50% redistribution target, so a proposal triggers)
- jp8: 2,000 / 10,000 L

## API

- `POST /api/v1/depots` request gains `site_type` (optional). A typed site is created with
  default stock; a null `site_type` keeps the old bare-marker behaviour (no stock).
- `GET /api/v1/advice/site-refuel/{depot_id}` → `AdviceResult` — the redistribution moves
  (transfers/buys) whose target is `depot_id` (the low-site proposal). 404 if the depot is
  unknown.

## Business Rules

- `site_type` is validated against the AJP-4.6 set; an unknown value is rejected (422).
- Default-stocked typed sites start below the redistribution target so the advisor proposes a
  fill immediately (demonstrates the low-fuel proposal).
- Clicking a supply point eases the map to it (locate); it does not place anything.
- The low-fuel proposal is on-demand (per site) and reuses the existing optimizer — no new
  optimization logic.

## Data Flow

`site_type`: picker → `POST /depots` → `fuel_depots.site_type` → overview/map. Proposal:
`redistribution_plan(depots, stocks)` filtered to the site → `AdviceResult` → panel.

## Dependencies

- W10 add-depot (`create_depot`) — extended here, not replaced.
- Wave-6 redistribution advisor — reused for the proposal.

## Security

`POST /depots` `site_type` and `GET /advice/site-refuel/{depot_id}` take operator input;
`site_type` is enum-validated and `depot_id` is a lookup key (404 on miss). Single-user server.

## Known Issues

(none)

## Bugs

(none yet)
