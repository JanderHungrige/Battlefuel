#!/usr/bin/env bash
# BattleFuel local dev launcher — one command to bring the whole stack up.
#
# Starts: PostgreSQL+PostGIS (Docker, background) → backend API (:8000) → frontend (:5173).
# Applies migrations + seed data (idempotent). Bootstraps the Python venv / npm deps on
# first run. Press Ctrl+C to stop the backend and frontend (the DB keeps running; use
# `make stop` to stop it).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

info() { printf "\033[36m▶ %s\033[0m\n" "$1"; }
die() {
  printf "\033[31m✖ %s\033[0m\n" "$1"
  exit 1
}

# 1. Docker daemon
if ! docker info >/dev/null 2>&1; then
  info "Docker not running — launching Docker Desktop…"
  open -a Docker >/dev/null 2>&1 || true
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || die "Docker didn't start. Open Docker Desktop, then re-run."
fi

# 2. Database (wait for healthy)
info "Starting database (PostgreSQL + PostGIS)…"
docker compose up -d db >/dev/null
for _ in $(seq 1 30); do
  [ "$(docker inspect -f '{{.State.Health.Status}}' battlefuel-db 2>/dev/null)" = "healthy" ] && break
  sleep 2
done

# 3. Backend env (bootstrap on first run)
if [ ! -x backend/.venv/bin/uvicorn ]; then
  info "Setting up backend Python environment (first run)…"
  python3 -m venv backend/.venv
  backend/.venv/bin/python -m pip install -q --upgrade pip
  (cd backend && .venv/bin/python -m pip install -q -e ".[dev]")
fi

# 4. Migrations + seed data (all idempotent)
info "Applying migrations and seed data…"
(cd backend && .venv/bin/alembic upgrade head >/dev/null)

# 4a. OSM geometry in PostGIS (osm_points/lines/multipolygons) — the terrain source for
# tile seeding. Import once if absent (e.g. a fresh/recreated DB volume); otherwise skip.
# Needs GDAL/ogr2ogr on the host (same prerequisite as build_basemap.sh).
osm_ready() {
  docker exec battlefuel-db psql -U battlefuel -d battlefuel -tAc \
    "SELECT to_regclass('osm_multipolygons')" 2>/dev/null | grep -q osm_multipolygons
}
if osm_ready; then
  info "OSM PostGIS tables present — skipping import."
else
  info "Importing OSM geometry into PostGIS (first run / fresh volume)…"
  bash backend/scripts/import_osm_to_postgis.sh >/dev/null ||
    die "OSM import failed. Need ogr2ogr (GDAL) installed and data/hohenfels.osm present (run backend/scripts/build_basemap.sh)."
fi

(cd backend && .venv/bin/python scripts/generate_tiles.py >/dev/null)
(cd backend && .venv/bin/python scripts/seed_unit_instances.py >/dev/null)
(cd backend && .venv/bin/python scripts/seed_supply.py >/dev/null)

# 4b. Routing graph (Wave 3) — build once if the `ways` table is empty/absent.
ways_ready() {
  docker exec battlefuel-db psql -U battlefuel -d battlefuel -tAc \
    "SELECT count(*) FROM ways" 2>/dev/null | grep -qE '^[1-9]'
}
if ways_ready; then
  info "Routing graph present — skipping build."
else
  info "Building routing graph (Wave 3; first run — osm2pgrouting in the DB image)…"
  bash backend/scripts/build_routing_graph.sh ||
    die "Routing graph build failed. Check osm2pgrouting is in the DB image and data/hohenfels-roads.osm exists (or the network is up for the OSM extract)."
fi

# 5. Frontend deps + basemap
[ -d frontend/node_modules ] || (info "Installing frontend deps (first run)…" && cd frontend && npm install)
[ -f data/hohenfels.pmtiles ] || die "Missing data/hohenfels.pmtiles — run: bash backend/scripts/build_basemap.sh"

# 6. Launch backend + frontend; clean up both on exit
info "Starting backend (:8000) and frontend (:5173)…  Press Ctrl+C to stop."
pids=()
(cd backend && exec .venv/bin/uvicorn app.main:app --reload --port 8000) &
pids+=($!)
(cd frontend && exec npm run dev) &
pids+=($!)
trap 'echo; info "Stopping backend & frontend…"; kill "${pids[@]}" 2>/dev/null || true' INT TERM EXIT

sleep 3
printf "\n\033[32m✅ BattleFuel is up:\n   API  → http://localhost:8000/docs\n   App  → http://localhost:5173\033[0m\n\n"
wait
