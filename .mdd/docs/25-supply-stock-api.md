---
id: 25-supply-stock-api
title: Supply Stock API — Depots, Stock & Distribution Overview
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [24-fuel-supply-model, 08-unit-instances, 04-unit-query-api]
relates: [24-fuel-supply-model, 29-of8-supply-ui]
source_files:
  - backend/app/domain/supply.py
  - backend/app/services/supply_overview.py
  - backend/app/api/supply.py
  - backend/app/main.py
routes:
  - GET /api/v1/depots
  - GET /api/v1/depots/{depot_id}
  - GET /api/v1/fuel-stocks
  - GET /api/v1/supply/overview
models:
  - fuel_depots
  - fuel_stocks
  - unit_instances
test_files:
  - backend/tests/test_supply_api.py
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [fuel, supply, depot, stock, distribution, api, overview]
path: Supply/API
integration_contracts: []
satisfies_contracts:
  - from: 24-fuel-supply-model
    function: "build_supply_provider(settings)"
    when: "Read endpoints obtain depots/stock through the factory, never querying fuel_* tables directly."
    status: done
    verified_at: "backend/app/api/supply.py:27"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 25 — Supply Stock API — Depots, Stock & Distribution Overview

## Purpose

Expose the read side of the fuel supply layer so the OF-8 view can answer "how much fuel is
where." Lists depots and per-(depot, fuel-type) stock, and computes a **distribution
overview** that combines fixed-depot stock with the fuel carried by mobile fuel trucks
(tankers). Read-only — mutation is feature 27 (buy) / 26 (refuel).

## Architecture

```
api/supply.py             GET /depots, /depots/{id}, /fuel-stocks, /supply/overview
services/supply_overview.py   build_supply_overview(): joins depot stock + truck fuel
domain/supply.py          DepotFuel, TruckFuel, SupplyOverview (response aggregates)
```

Depots/stock come from `build_supply_provider()` (24). Trucks come from
`build_unit_instance_provider()` (08) cross-referenced with `build_unit_provider()` (04):
an instance is a "fuel truck" when its `UnitType.nato_unit_type == FUEL_SUPPLY`; the truck's
carried fuel is its `current_fuel_liters` and its fuel type is `UnitType.fuel.fuel_type`.
All access is via the factories — no direct table queries in the endpoint.

## Data Model

No new tables. New response aggregates in `domain/supply.py`:

- **`DepotFuel`** — `depot: FuelDepot` + `stocks: list[FuelStock]`.
- **`TruckFuel`** — `instance_id`, `name`, `unit_type_id`, `fuel_type: FuelType`,
  `current_fuel_liters: float | None`, `capacity_liters`, `lat`, `lon`, `h3_index`.
- **`SupplyOverview`** — `depots: list[DepotFuel]`, `trucks: list[TruckFuel]`,
  `total_depot_liters_by_type: dict[str, float]`, `total_truck_liters: float`
  (sum over trucks that have telemetry — `None`-fuel trucks excluded from the total).

## API Endpoints

| Method | Path | Returns | Notes |
|--------|------|---------|-------|
| GET | `/api/v1/depots` | `list[FuelDepot]` | All depots |
| GET | `/api/v1/depots/{depot_id}` | `FuelDepot` | 404 if unknown |
| GET | `/api/v1/fuel-stocks` | `list[FuelStock]` | Optional `?depot_id=` and `?fuel_type=` filters |
| GET | `/api/v1/supply/overview` | `SupplyOverview` | Depot stock + mobile-truck fuel + totals |

## Business Rules

- `fuel_type` query filter is validated against the `FuelType` enum (FastAPI 422 on invalid).
- A truck with `current_fuel_liters is None` (no telemetry) still appears in `trucks` but is
  **excluded** from `total_truck_liters` (consistent with the missing-telemetry model).
- `total_depot_liters_by_type` sums `quantity_liters` across all depots per fuel type.

## Data Flow

- **Depots/stock:** `fuel_depots` / `fuel_stocks` rows → `SupplyProvider` → API models (24).
- **Truck fuel:** `unit_instances.current_fuel_liters` (08) filtered by
  `UnitType.nato_unit_type == FUEL_SUPPLY` (04) → `TruckFuel`.
- **Consumed by:** 29-of8-supply-ui (distribution panel + depot overlay).

## Dependencies

- **24-fuel-supply-model** — `SupplyProvider` / `build_supply_provider`.
- **08-unit-instances** — `UnitInstanceProvider` for placed trucks.
- **04-unit-query-api** — `build_unit_provider` for unit-type fuel metadata.

## Security

Read-only endpoints over server-owned game state; no external write input. The `fuel_type`
query param is enum-validated. No auth (single-user MVP; OF-8 gating is a frontend concern —
feature 28).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
