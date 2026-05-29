---
id: battlefuel-wave-1
title: "Wave 1: Unit Database & Data Factory"
initiative: battlefuel
initiative_version: 2
status: planned
depends_on: none
demo_state: "Query the seeded NATO unit catalog over /api/v1/units and get full per-type stats; switch the active data provider via config with no code change."
created: 2026-05-30
hash: 7dda6611
---

# Wave 1: Unit Database & Data Factory

## Demo-State
Query the seeded NATO unit catalog over `/api/v1/units` and get full per-type stats;
switch the active data provider via config with no code change.
*(This wave is not complete until this can be manually demonstrated.)*

## Scope
Wave 1 delivers the **unit-type catalog** (templates with stat baselines) and the
**data-source factory** that abstracts where unit data comes from. Placed unit **instances**
— with a map position and a depleting live fuel level — are deferred to Wave 2/3, where the
map exists to position them on. Backend-only: FastAPI + PostgreSQL/PostGIS, fully typed.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | unit-stats-model | — | planned | — |
| 2 | data-source-factory | — | planned | unit-stats-model |
| 3 | seed-unit-catalog | — | planned | data-source-factory |
| 4 | unit-query-api | — | planned | data-source-factory |

### Feature notes
- **unit-stats-model** — typed domain model (Pydantic) + DB schema for a NATO unit type:
  identity (type, echelon, APP-6 SIDC), fuel (type, capacity, consumption normal/combat/idle),
  movement (road/offroad/combat speed, operational range), combat (power, armor/weight class,
  crew), recon ability, operational status, telemetry freshness. Extensible by design.
- **data-source-factory** — abstract `UnitDataProvider` interface + a factory selecting the
  implementation from config. This is the architectural keystone: the single swap point so the
  data layer can move seed → real values → live streams without touching game logic.
- **seed-unit-catalog** — a `SeedUnitProvider` implementing the interface, plus seed data: a
  representative NATO set (armor, mechanized infantry, artillery, recon, logistics/fuel,
  engineer…) with plausible fuel/speed figures. Alembic migration + seed script.
- **unit-query-api** — `/api/v1/units` endpoints (list / filter / get-by-id) returning full
  stats via the factory. Makes the demo-state demonstrable.

## Open Research
- **Realistic unit figures** — source unclassified/public approximations for NATO unit fuel
  consumption (normal/combat/idle) and speeds. Stored values must be clearly flagged as
  **illustrative/approximate, not authoritative or operational**.
- **APP-6 SIDC codes** — decide which symbol identification codes to persist per unit type so
  Wave 2's `milsymbol` rendering can consume them directly.
- **ORM/migration toolset** — confirm SQLAlchemy 2.0 (async) + Alembic behind the factory
  (recommended) vs. raw `asyncpg`.
