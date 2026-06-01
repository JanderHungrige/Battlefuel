---
id: 24-fuel-supply-model
title: Fuel Supply Model — Depots, Stock & Provider
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [07-hex-tile-model-api, 08-unit-instances]
relates: [25-supply-stock-api, 26-refuel-orders, 27-buy-orders]
source_files:
  - backend/alembic/versions/0008_create_fuel_supply.py
  - backend/app/domain/supply.py
  - backend/app/models/supply.py
  - backend/app/providers/supply.py
  - backend/app/services/supply_seed.py
  - backend/app/config.py
  - backend/scripts/seed_supply.py
routes: []
models:
  - fuel_depots
  - fuel_stocks
test_files:
  - backend/tests/test_supply.py
data_flow: greenfield
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [fuel, supply, depot, stock, factory, postgis, seed]
path: Supply/Depots
integration_contracts:
  - function: "SupplyProvider.adjust_stock(session, depot_id, fuel_type, delta_liters)"
    when: "Any feature that adds or removes depot fuel (buy delivery, depot drawdown) MUST go through this method — never UPDATE fuel_stocks directly."
    consumers: [27-buy-orders]
  - function: "build_supply_provider(settings)"
    when: "Any feature reading depots/stock MUST obtain the provider via the factory — never instantiate DbSupplyProvider directly or query fuel_* tables in game logic."
    consumers: [25-supply-stock-api, 26-refuel-orders, 27-buy-orders]
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 24 — Fuel Supply Model — Depots, Stock & Provider

## Purpose

Introduce fuel as a tracked, finite theater resource. A **`FuelDepot`** is a fixed
supply location (name + position + H3 cell); a **`FuelStock`** row holds how much of one
fuel type a depot currently has (and its capacity). This is the data foundation the rest of
Wave 5 builds on: the read API (25), refuel orders (26), and buy orders (27). Mobile fuel
trucks are **not** modelled here — they reuse the existing `UnitInstance` (a tanker's carried
fuel is its `current_fuel_liters`); this feature is the *fixed-depot* side of the supply
picture.

## Architecture

Mirrors the established three-layer + factory pattern used by units, tiles, and move orders:

```
domain/supply.py    FuelDepot, FuelStock (frozen Pydantic; API representation)
models/supply.py    FuelDepotRow, FuelStockRow (SQLAlchemy ORM rows)
providers/supply.py SupplyProvider (ABC) → DbSupplyProvider; factory build_supply_provider()
services/supply_seed.py   seed_fuel_supply(session): idempotent depot + stock seed
alembic/0008          fuel_depots, fuel_stocks tables
```

**Swap point:** every consumer depends on the `SupplyProvider` interface and obtains one via
`build_supply_provider()`, selected by `settings.supply_provider` (`"db"` ships now). No game
logic touches the `fuel_*` tables directly. This keeps the seed → real → live-stream swap a
config change, per the locked factory rule.

## Data Model

**`fuel_depots`**
| Column | Type | Notes |
|--------|------|-------|
| `id` | String, PK | e.g. `depot-main` |
| `name` | String, not null | Display name, e.g. "Main Supply Point" |
| `h3_index` | String, not null | H3 cell the depot sits in (resolution = `DEFAULT_RESOLUTION`) |
| `lat` | Float, not null | Depot latitude |
| `lon` | Float, not null | Depot longitude |

**`fuel_stocks`** — one row per (depot, fuel type)
| Column | Type | Notes |
|--------|------|-------|
| `depot_id` | String, PK (composite) | References `fuel_depots.id` |
| `fuel_type` | String, PK (composite) | `FuelType` value (`diesel`, `jp8`, …) |
| `quantity_liters` | Float, not null | Current stock, ≥ 0 |
| `capacity_liters` | Float, not null | Max stock for this fuel type at this depot, ≥ 0 |

Index `ix_fuel_stocks_depot_id` on `depot_id`. No DB foreign key to `fuel_depots` (kept
consistent with the project's existing no-FK convention for seed-validated references).

Domain models (`FuelDepot`, `FuelStock`) are frozen Pydantic models with `quantity_liters`
and `capacity_liters` constrained `ge=0`; `fuel_type` is the `FuelType` enum reused from
`domain/unit.py`.

## API Endpoints

None. Read endpoints are feature **25-supply-stock-api**; this feature is model + provider +
seed only.

## Business Rules

- **`adjust_stock(session, depot_id, fuel_type, delta_liters)`** — the single mutation path for
  depot stock. Adds `delta_liters` (may be negative), then **clamps** the result to
  `[0, capacity_liters]`. Returns the updated `FuelStock`, or `None` if the (depot, fuel_type)
  stock row does not exist. Commits. Buy delivery (27) and any future depot drawdown go through
  this — never a raw UPDATE.
- **Seed is idempotent** — `seed_fuel_supply` uses INSERT … ON CONFLICT DO UPDATE so re-seeding
  restores canonical depots/quantities (matching `instance_seed`'s reset semantics). Seeded
  depot tiles are best-effort marked `situation = supply_point` if the tile row exists.
- A depot may hold multiple fuel types (multiple `fuel_stocks` rows). Quantity never exceeds
  capacity and never drops below 0.

## Data Flow

Greenfield — introduces new tables and domain types. The only existing data read is the tile
grid resolution (`DEFAULT_RESOLUTION`) and, best-effort, the `tiles` row for a depot's cell to
tag it `supply_point`. Downstream: 25 reads depots/stock for the OF-8 distribution view; 26/27
read and (27) mutate stock via the provider.

## Dependencies

- **07-hex-tile-model-api** — H3 cell indexing (`DEFAULT_RESOLUTION`, `latlng_to_cell`) and the
  `tiles.situation` column for `supply_point` tagging.
- **08-unit-instances** — fuel trucks are `UnitInstance`s; this model is the fixed-depot
  counterpart (no code dependency, conceptual pairing).

## Security

Not a security-enforcement feature. No external/user input (seed data is server-defined; the
read/write APIs and their validation live in 25/26/27). Stores only non-sensitive game state.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
