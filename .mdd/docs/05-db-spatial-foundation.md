---
id: 05-db-spatial-foundation
title: DB & Spatial Foundation
edition: MDD
depends_on: []
relates: [07-hex-tile-model-api, 08-unit-instances]
source_files:
  - docker-compose.yml
  - backend/app/db.py
  - backend/app/config.py
  - backend/alembic.ini
  - backend/alembic/env.py
  - backend/alembic/versions/0001_enable_postgis.py
  - backend/pyproject.toml
routes: []
models: []
test_files:
  - backend/tests/test_db_foundation.py
data_flow: greenfield
last_synced: 2026-05-31
status: complete
phase: all
mdd_version: 11
tags: [postgis, postgresql, sqlalchemy, alembic, async, docker]
path: Platform/Database
integration_contracts:
  - function: "app.db.Base"
    when: "every ORM model must inherit from Base so Alembic sees its table"
  - function: "app.db.get_session"
    when: "request-scoped DB access in API routes"
satisfies_contracts: []
security_read_sites: []
known_issues:
  - "Dev DB credentials default to battlefuel/battlefuel via env substitution; override BATTLEFUEL_DB_* for anything non-local."
sister_projects: []
---

# 05 — DB & Spatial Foundation

## Purpose
Stands up the real persistence layer for BattleFuel: PostgreSQL + PostGIS in Docker, an
async SQLAlchemy engine/session, and Alembic migrations. This is the substrate every
spatial feature (tiles, unit instances, later the routing graph) builds on.

## Architecture
- `docker-compose.yml` — `db` service on `postgis/postgis:16-3.4` with a healthcheck and a
  named volume; credentials/port via `BATTLEFUEL_DB_*` env substitution (dev defaults).
- `app/db.py` — `Base` (DeclarativeBase) + lazily-created async engine and
  `async_sessionmaker` singletons; `get_session()` FastAPI dependency.
- `app/config.py` — `database_url` (async asyncpg URL).
- `alembic/` — async migration environment wired to `app.config` (URL) and `Base.metadata`
  (autogenerate target); `0001_enable_postgis` turns on the PostGIS extension.

## Data Model
No domain tables yet — this feature provides the base and the PostGIS extension. Tile and
unit-instance tables arrive in Features 07 and 08.

## API Endpoints
None.

## Business Rules
- Engine/session are created lazily so importing `app.db` never opens a connection.
- Migrations are the only way schema changes reach the DB (`alembic upgrade head`).

## Data Flow
Greenfield. Config → async engine → session → (future) ORM models. Alembic reads
`Base.metadata` to plan migrations.

## Dependencies
None (foundational). Consumers: Features 07, 08, and the existing API app.

## Security
Database credentials come from environment variables (`BATTLEFUEL_DB_*` / `database_url`),
never hardcoded in source. Dev defaults are for local Docker only. No external user input
at this layer.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
