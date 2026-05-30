---
id: 02-data-source-factory
title: Data Source Factory
edition: MDD
depends_on: [01-unit-stats-model]
relates: [03-seed-unit-catalog, 04-unit-query-api]
source_files:
  - backend/app/providers/base.py
  - backend/app/providers/factory.py
  - backend/app/config.py
routes: []
models: []
test_files:
  - backend/tests/test_provider_factory.py
data_flow: greenfield
last_synced: 2026-05-30
status: complete
phase: all
mdd_version: 11
tags: [factory, providers, data-source, modularity, config]
path: Units/DataSource
integration_contracts:
  - function: "build_unit_provider(settings)"
    when: "any consumer that needs unit data — never import a concrete provider directly"
    note: "Consumers depend on the UnitDataProvider interface; the factory chooses the impl from config."
satisfies_contracts: []
security_read_sites: []
known_issues:
  - "Only the seed provider is registered in Wave 1; PostgreSQL/live-stream providers register later under their own names (no change to this code)."
sister_projects: []
---

# 02 — Data Source Factory

## Purpose
The architectural keystone of BattleFuel's modular data layer: an abstract
`UnitDataProvider` interface plus a registry-backed factory that builds the concrete
provider named in config. This is the single swap point that lets the data source move
from seed data → real values → live streams with no change to consumers.

## Architecture
- `app/providers/base.py` — `UnitDataProvider(ABC)` with `list_units()` and `get_unit(id)`.
- `app/providers/factory.py` — a name→builder registry. `register_provider(name, builder)`
  adds a provider; `build_unit_provider(settings)` resolves the name from config and
  constructs it; `available_providers()` lists registered names; `UnknownProviderError`
  is raised for an unregistered name.
- `app/config.py` — `Settings.unit_provider` (env `BATTLEFUEL_UNIT_PROVIDER`, default `seed`).

Providers self-register on import, so adding a data source is "write a provider + call
`register_provider`" — no edit to the factory and no change to any consumer.

## API Endpoints
None — internal infrastructure.

## Business Rules
- Config selects the active provider by name.
- Unknown provider name → `UnknownProviderError` listing available names.
- Re-registering a name overwrites the prior builder.

## Data Flow
Greenfield. `build_unit_provider()` reads `Settings.unit_provider`, looks it up in the
registry, and returns a `UnitDataProvider`. The API layer (Feature 04) consumes the
returned interface; the seed provider (Feature 03) is one registered implementation.

## Dependencies
- `01-unit-stats-model` — the `UnitType` shape providers return.

## Security
No external input. `unit_provider` is operator-supplied configuration, not end-user
input. Unknown values fail closed with `UnknownProviderError` rather than constructing
an arbitrary object.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
