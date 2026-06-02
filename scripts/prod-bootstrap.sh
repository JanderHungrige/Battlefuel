#!/usr/bin/env bash
# One-time (idempotent) production data bootstrap, run on the host against the production
# compose stack AFTER `docker compose -f compose.prod.yml up -d`:
#   1. apply migrations   2. seed tiles/units/supply   3. build + annotate the routing graph
#
# Safe to re-run: migrations and seeds are idempotent, and the routing-graph build is skipped
# when `ways` is already populated. The routing graph runs osm2pgrouting INSIDE the db
# container (the image ships it; ./data is mounted read-only at /data).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Uses Docker's native COMPOSE_FILE (defaults to the prod file). Override to inject extra
# files (e.g. a local test override): COMPOSE_FILE=compose.prod.yml:compose.test.yml
export COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"
COMPOSE=(docker compose)
DB_NAME="${BATTLEFUEL_DB_NAME:-battlefuel}"
DB_USER="${BATTLEFUEL_DB_USER:-battlefuel}"
DB_PASS="${BATTLEFUEL_DB_PASSWORD:?BATTLEFUEL_DB_PASSWORD must be set (export it or source .env)}"

info() { printf '\033[36m▶ %s\033[0m\n' "$1"; }

info "Applying migrations…"
"${COMPOSE[@]}" exec -T backend alembic upgrade head

info "Importing OSM geometry into PostGIS (osm_points/lines/multipolygons)…"
# One-shot GDAL container; reads the shipped data/hohenfels.osm. Tile terrain derives
# from these tables, so this must precede generate_tiles.py.
"${COMPOSE[@]}" run --rm osm-import

info "Seeding tiles, units, and supply (idempotent)…"
"${COMPOSE[@]}" exec -T backend python scripts/generate_tiles.py
"${COMPOSE[@]}" exec -T backend python scripts/seed_unit_instances.py
"${COMPOSE[@]}" exec -T backend python scripts/seed_supply.py

ways_count="$("${COMPOSE[@]}" exec -T db psql -U "$DB_USER" -d "$DB_NAME" -tAc \
  "SELECT count(*) FROM ways" 2>/dev/null | tr -d '[:space:]' || true)"
if [ "${ways_count:-0}" -gt 0 ] 2>/dev/null; then
  info "Routing graph present (${ways_count} ways) — skipping build."
else
  info "Building routing graph (osm2pgrouting in the db container)…"
  "${COMPOSE[@]}" exec -T db osm2pgrouting \
    -f /data/hohenfels-roads.osm -c /usr/share/osm2pgrouting/mapconfig.xml \
    -d "$DB_NAME" -U "$DB_USER" -W "$DB_PASS" -h localhost -p 5432 --clean
  info "Annotating ways with tile threat + safe_cost…"
  "${COMPOSE[@]}" exec -T backend python scripts/annotate_routing.py
fi

info "Bootstrap complete."
