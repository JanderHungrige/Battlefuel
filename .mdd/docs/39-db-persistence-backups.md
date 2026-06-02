---
id: 39-db-persistence-backups
title: DB Persistence, First-Boot Bootstrap & Automated Backups
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-7
wave_status: active
depends_on: [38-production-stack]
relates: [40-opentofu-hetzner, 41-deploy-runbook]
source_files:
  - compose.prod.yml
  - .env.example
  - scripts/prod-bootstrap.sh
  - scripts/backup.sh
  - scripts/restore.sh
  - deploy/crontab.example
routes: []
models: []
test_files: []
data_flow: writes-existing
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [postgres, postgis, persistence, block-volume, backup, restore, pg_dump, bootstrap, osm2pgrouting, ogr2ogr]
path: Deploy/Persistence
integration_contracts:
  - function: "compose.prod.yml db service + battlefuel-db-data volume (feature 38)"
    when: "this feature binds the db volume to the Hetzner block volume and layers bootstrap + backup tooling on top."
    consumers: []
satisfies_contracts:
  - from: 38-production-stack
    function: "battlefuel-db-data bound to the Hetzner block volume mount"
    when: "production data must survive redeploys / host loss."
    status: done
    verified_at: "compose.prod.yml:volumes.battlefuel-db-data"
  - from: 40-opentofu-hetzner
    function: "BATTLEFUEL_DB_DATA_DIR / BATTLEFUEL_BACKUP_DIR live under the mounted block volume"
    when: "OpenTofu provisions + mounts the block volume at /mnt/battlefuel-data and cloud-init mkdir -p the pgdata/backups dirs."
    status: done
    verified_at: "infra/cloud-init.yaml.tftpl"
known_issues:
  - "The type=none,o=bind named volume mounts on a Linux host (Hetzner) but NOT on Docker Desktop (device path resolves inside the VM). Local testing uses a named-volume override via COMPOSE_FILE."
  - "Bootstrap needs data/hohenfels.osm and data/hohenfels-roads.osm on the host; both are gitignored, so the deploy must ship data/ (feature 41). If absent, the underlying dev scripts can re-fetch from Overpass (needs internet during bootstrap)."
  - "Backups are local to the block volume; offsite copy (Storage Box / S3) is deferred (Open Research)."
security_read_sites: []
sister_projects: []
---

# 39 — DB Persistence, First-Boot Bootstrap & Automated Backups

## Purpose
Make production game state **durable**, **reproducibly seeded**, and **recoverable**: pin the
Postgres data dir to the Hetzner block volume, give the stack a one-shot bootstrap that loads
the full data pipeline, and add scheduled backups with a tested restore.

## What was built
- **Block-volume persistence** (`compose.prod.yml`) — `battlefuel-db-data` is now a
  `type=none,o=bind` local volume whose `device` is `${BATTLEFUEL_DB_DATA_DIR}` (default
  `/mnt/battlefuel-data/pgdata` on the block volume). `BATTLEFUEL_BACKUP_DIR` lives on the same
  volume so backups survive host loss.
- **`scripts/prod-bootstrap.sh`** — idempotent one-shot bootstrap run after `compose up`:
  1. `alembic upgrade head`
  2. **OSM → PostGIS import** via a new one-shot **GDAL** service (`osm-import`, `bootstrap`
     profile, `ghcr.io/osgeo/gdal`) that runs `ogr2ogr` against `data/hohenfels.osm` →
     `osm_points/lines/multipolygons` (no GDAL needed on the host)
  3. seed tiles / units / supply (`generate_tiles.py`, `seed_unit_instances.py`,
     `seed_supply.py`)
  4. **routing graph** — `osm2pgrouting` inside the db container (skipped if `ways` already
     populated), then `annotate_routing.py` for threat + `safe_cost`.
- **`scripts/backup.sh`** — timestamped, gzipped `pg_dump --clean --if-exists` to
  `BATTLEFUEL_BACKUP_DIR`; fails loudly on an empty dump; prunes dumps older than
  `BATTLEFUEL_BACKUP_RETENTION_DAYS`.
- **`scripts/restore.sh`** — restores a chosen dump (confirm prompt unless `FORCE=1`).
- **`deploy/crontab.example`** — nightly backup cron line (sources `.env`, runs `backup.sh`).
- All three scripts honour Docker's native **`COMPOSE_FILE`** env (default `compose.prod.yml`)
  so a deploy or local test can inject extra compose files.

## Gaps found while building (clean-environment wins)
A from-scratch bootstrap surfaced two ordering/packaging gaps the dev flow hid:
1. **`generate_tiles.py` needs the `osm_*` PostGIS tables** (tile terrain derives from them) —
   they were imported ad hoc in dev with host GDAL. Fixed by adding the containerised
   `osm-import` step **before** tile seeding.
2. **The `.osm` extracts are gitignored**, so they aren't on a fresh host. Documented that the
   deploy ships `data/` (feature 41); dev scripts can otherwise re-fetch from Overpass.

## How it was verified (full local e2e)
Isolated stack (named-volume override via `COMPOSE_FILE`, since the bind volume can't mount on
Docker Desktop):
- `prod-bootstrap.sh` ran clean: OSM import → seed → routing graph (**1265 ways → 2683
  annotated edges**). Post-bootstrap counts: tiles=146, ways=2683, depots=2, units=5;
  `GET /api/v1/unit-instances` → `200`, 5 units.
- `backup.sh` wrote an 896K dump + retention prune.
- Round-trip: deleted all 5 units → `restore.sh` (FORCE) → **5 units restored**.
- `docker compose config` validates the bind-volume form for the real Linux host.

## Notes / decisions
- **OSM import containerised** (GDAL one-shot) so the host needs no GDAL — mirrors how
  `osm2pgrouting` already runs inside the db image. Resolves the "OSM seed data delivery"
  open-research item (ship `data/`, import in-container).
- Offsite backup replication is deferred (single block-volume copy for Standard scope).
