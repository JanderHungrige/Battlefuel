---
id: 08-unit-instances
title: Unit Instances
edition: MDD
depends_on: [05-db-spatial-foundation, 01-unit-stats-model]
relates: [10-map-overlays-inspect, 07-hex-tile-model-api]
source_files:
  - backend/app/domain/unit_instance.py
  - backend/app/models/unit_instance.py
  - backend/app/providers/unit_instances.py
  - backend/app/api/unit_instances.py
  - backend/app/services/instance_seed.py
  - backend/alembic/versions/0003_create_unit_instances.py
  - backend/scripts/seed_unit_instances.py
routes:
  - "GET /api/v1/unit-instances"
  - "GET /api/v1/unit-instances/{instance_id}"
models:
  - unit_instances
test_files:
  - backend/tests/test_unit_instances.py
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [units, instances, placement, h3, fastapi, telemetry]
path: Units/Instances
integration_contracts:
  - function: "GET /api/v1/unit-instances"
    when: "F10 renders units as APP-6 symbols and inspects them"
satisfies_contracts:
  - from: 05-db-spatial-foundation
    function: "Base / get_session"
    when: "UnitInstanceRow ORM + request-scoped reads"
    status: done
    verified_at: "backend/app/models/unit_instance.py:16"
security_read_sites: []
known_issues:
  - "Endpoint path is /unit-instances (not /units/instances in the wave doc) to avoid colliding with /units/{unit_id}."
  - "unit_type_id has no DB foreign key (the catalog is the seed provider, not a table); validity is enforced at seed time."
  - "Movement and fuel depletion are Wave 3 — instances are static placements here."
sister_projects: []
---

# 08 — Unit Instances

## Purpose
Places concrete units on the map: each instance references a Wave 1 `UnitType`, has a
position + H3 tile, an operational status, and an optional current fuel level. A `None`
fuel value models "no telemetry received" — the seed deliberately includes one such unit.

## Architecture
- `domain/unit_instance.py` — `InstanceStatus` + `UnitInstance` schema (`has_telemetry`).
- `models/unit_instance.py` — `UnitInstanceRow` (`unit_instances` table).
- `providers/unit_instances.py` — `UnitInstanceProvider` interface + `DbUnitInstanceProvider`
  + factory.
- `api/unit_instances.py` — `/unit-instances` list + by-id.
- `services/instance_seed.py` — 5 demo placements (incl. one with no telemetry), validated
  against the unit catalog; H3 cell computed from position.

## Data Model
`unit_instances`: `id` (PK), `name`, `unit_type_id`, `lat`, `lon`, `h3_index`, `status`,
`current_fuel_liters` (nullable).

## API Endpoints
- `GET /api/v1/unit-instances` → `UnitInstance[]`.
- `GET /api/v1/unit-instances/{instance_id}` → `UnitInstance` (200) or 404.

## Business Rules
- Each placement's `unit_type_id` must exist in the catalog (enforced when seeding).
- `current_fuel_liters = null` denotes missing telemetry (`has_telemetry == false`).

## Data Flow
Seed placements → validated against `build_unit_provider()` → `unit_instances` rows (H3 from
position) → API reads via `DbUnitInstanceProvider` → `UnitInstance` JSON.

## Dependencies
- `05-db-spatial-foundation` (DB/session), `01-unit-stats-model` (the referenced catalog).

## Security
Read-only endpoints; `instance_id` is a primary-key lookup (no injection surface).

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
