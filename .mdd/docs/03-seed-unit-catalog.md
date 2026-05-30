---
id: 03-seed-unit-catalog
title: Seed Unit Catalog
edition: MDD
depends_on: [02-data-source-factory, 01-unit-stats-model]
relates: [01-unit-stats-model, 04-unit-query-api]
source_files:
  - backend/app/providers/seed.py
  - backend/app/providers/seed_data.py
  - backend/app/providers/__init__.py
routes: []
models: []
test_files:
  - backend/tests/test_seed_catalog.py
data_flow: greenfield
last_synced: 2026-05-30
status: complete
phase: all
mdd_version: 11
tags: [seed-data, catalog, nato, sidc, providers]
path: Units/Catalog
integration_contracts: []
satisfies_contracts:
  - from: 02-data-source-factory
    function: "UnitDataProvider (list_units, get_unit)"
    when: "registered as the 'seed' provider"
    status: done
    verified_at: "backend/app/providers/seed.py:39"
known_issues:
  - "Stat values and SIDC entity codes are provisional/illustrative (see open-research notes); replace with authoritative data when a real source is wired."
sister_projects: []
---

# 03 — Seed Unit Catalog

## Purpose
A concrete in-memory `UnitDataProvider` serving a realistic, illustrative catalog of
12 NATO unit types spanning the categories the supply-chain game needs (armor, mech
infantry, infantry, artillery, recon, fuel supply, logistics, engineer, air defense,
medical, HQ, dismounted squad). Requires no database — makes Wave 1 runnable and
CI-friendly.

## Architecture
- `app/providers/seed_data.py` — `SEED_UNITS: tuple[UnitType, ...]` plus `_sidc()`
  (builds 20-digit MIL-STD-2525D friendly land-unit codes from echelon + entity tables)
  and a `_unit()` constructor helper.
- `app/providers/seed.py` — `SeedUnitProvider` (indexes the catalog by id, guards against
  duplicate ids) and `register_provider("seed", SeedUnitProvider)`.
- `app/providers/__init__.py` — imports `seed` so registration runs on package import.

## API Endpoints
None directly — surfaced via Feature 04.

## Business Rules
- All unit ids are unique (provider raises `ValueError` on duplicates).
- Every entry satisfies the model invariants from Feature 01 (enforced at construction).
- Seed SIDCs are 20 numeric digits.
- The dismounted squad has `fuel_type=none` and `None` endurance (exercises that path).

## Data Flow
Greenfield. `SEED_UNITS` is constructed at import (validated by the model), indexed by
`SeedUnitProvider`, and returned through the `UnitDataProvider` interface to the factory
and API.

## Dependencies
- `02-data-source-factory` — the interface implemented and the registry used.
- `01-unit-stats-model` — the `UnitType` constructed.

## Security
No external input. Catalog data is static and developer-authored.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
