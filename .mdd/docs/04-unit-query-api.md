---
id: 04-unit-query-api
title: Unit Query API
edition: MDD
depends_on: [02-data-source-factory, 01-unit-stats-model]
relates: [02-data-source-factory]
source_files:
  - backend/app/api/units.py
  - backend/app/main.py
routes:
  - "GET /api/v1/units"
  - "GET /api/v1/units/{unit_id}"
  - "GET /api/v1/health"
models: []
test_files:
  - backend/tests/test_units_api.py
data_flow: greenfield
last_synced: 2026-05-30
status: complete
phase: all
mdd_version: 11
tags: [api, fastapi, units, rest, query]
path: Units/API
integration_contracts: []
satisfies_contracts:
  - from: 02-data-source-factory
    function: "build_unit_provider()"
    when: "on every request, via the get_unit_provider FastAPI dependency"
    status: done
    verified_at: "backend/app/api/units.py:19"
security_read_sites: []
known_issues:
  - "Provider is rebuilt per request (cheap for seed data); add caching when a DB-backed provider lands."
sister_projects: []
---

# 04 — Unit Query API

## Purpose
HTTP access to the unit-type catalog under `/api/v1`. Delivers the Wave 1 demo-state:
query the seeded catalog and get full per-type stats, with the data source chosen by
config. Reads exclusively through the factory, so the API is agnostic to the backing
store.

## Architecture
- `app/api/units.py` — an `APIRouter` with `list_units` and `get_unit`; a
  `get_unit_provider` FastAPI dependency (`Annotated`-typed) that calls
  `build_unit_provider()`, overridable in tests.
- `app/main.py` — `create_app()` mounts the router and a `/health` check under the
  `/api/v1` prefix.

## API Endpoints
- `GET /api/v1/health` → `{"status": "ok"}`.
- `GET /api/v1/units` → `UnitType[]`. Optional query filters `nato_unit_type` and
  `echelon` (enum-validated; invalid value → `422`).
- `GET /api/v1/units/{unit_id}` → `UnitType` (`200`), or `404` `{"detail": "unit type
  '<id>' not found"}`.

Responses include the nested fuel/movement/combat profiles and the computed
`endurance_hours_normal` / `endurance_hours_combat`.

## Business Rules
- Filters are ANDed when both are supplied.
- Unknown `unit_id` → `404`; malformed enum filter → `422` (FastAPI validation).

## Data Flow
Request → `get_unit_provider` builds the configured provider → `list_units()`/`get_unit()`
→ FastAPI serializes `UnitType` (incl. computed fields) to JSON.

## Dependencies
- `02-data-source-factory` — request-time provider construction.
- `01-unit-stats-model` — the response shape.

## Security
Accepts untrusted external input (query params, path param). Mitigations:
- `nato_unit_type` / `echelon` are enum-validated by FastAPI → invalid input returns
  `422`, never reaches provider logic.
- `unit_id` is used only as a dict-key lookup against the in-memory catalog — no query
  interpolation, no filesystem/network use, no injection surface.
- Errors return structured detail only; no internal data is leaked.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
