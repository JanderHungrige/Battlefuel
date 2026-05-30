---
id: 01-unit-stats-model
title: Unit Stats Model
edition: MDD
depends_on: []
relates: [02-data-source-factory, 03-seed-unit-catalog]
source_files:
  - backend/app/domain/unit.py
routes: []
models: []
test_files:
  - backend/tests/test_unit_model.py
data_flow: greenfield
last_synced: 2026-05-30
status: complete
phase: all
mdd_version: 11
tags: [units, domain-model, nato, fuel, pydantic, sidc]
path: Units/Catalog
integration_contracts: []
satisfies_contracts: []
security_read_sites: []
known_issues:
  - "Stat values are illustrative/approximate, not authoritative or operational."
  - "No persistence layer yet — PostgreSQL/PostGIS-backed types deferred to a later wave (units gain geometry when placed on the map)."
sister_projects: []
---

# 01 — Unit Stats Model

## Purpose
Defines the typed domain model for a NATO unit *type* (a reusable catalog template),
carrying the fuel, movement, and combat baselines the whole game reasons about. This is
the foundational data shape every other Wave 1 feature builds on.

## Architecture
Pydantic v2 models in `backend/app/domain/unit.py`. A `UnitType` composes three frozen
sub-profiles — `FuelProfile`, `MovementProfile`, `CombatProfile` — plus identity fields
(`id`, `name`, `nato_unit_type`, `echelon`, `sidc`, `recon_level`). All models are
`frozen=True`: a catalog template is immutable. Enums (`NatoUnitType`, `Echelon`,
`FuelType`, `ArmorClass`, `ReconLevel`) are `StrEnum` so they serialize as readable
strings over the API.

## Data Model
`UnitType` fields:
- `id` — kebab-case slug (regex-validated)
- `name`, `description?`
- `nato_unit_type` (enum), `echelon` (enum)
- `sidc` — APP-6 / MIL-STD-2525 symbol identification code (10–20 alphanumerics), for
  Wave 2 `milsymbol` rendering
- `recon_level` (enum)
- `fuel: FuelProfile` — `fuel_type`, `capacity_liters`, `consumption_{normal,combat,idle}_lph`
- `movement: MovementProfile` — `speed_{road,offroad,combat}_kph`, `operational_range_km`
- `combat: CombatProfile` — `combat_power`, `armor_class`, `crew`, `weight_tons`

Computed fields: `endurance_hours_normal`, `endurance_hours_combat`
(`capacity / consumption`, or `None` when there is no fuel demand).

## API Endpoints
None — pure domain model. Exposed via Feature 04 (`unit-query-api`).

## Business Rules
- Fuel consumption invariant: `combat >= normal >= idle`.
- `fuel_type == none` requires `capacity_liters == 0` (dismounted units).
- Movement invariant: `speed_road_kph >= speed_offroad_kph`.
- All numeric stats are `>= 0`.
- Endurance is `None` when burn rate is `0` (never runs dry).

## Data Flow
Greenfield. Values originate in the seed catalog (Feature 03), are validated at model
construction, and are serialized to API consumers (Feature 04).

## Dependencies
None.

## Security
No external input at this layer; validation happens at construction. Inputs become
untrusted only at the API boundary (Feature 04).

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
