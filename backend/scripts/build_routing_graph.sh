#!/usr/bin/env bash
# Build the routable road graph for routing (Wave 3, Feature routing-graph).
#
# 1. Fetch a highways-only, nodes-first OSM extract via Overpass (osm2pgrouting needs nodes
#    to precede ways, which the basemap extract doesn't guarantee).
# 2. Run osm2pgrouting *inside the DB container* (installed in the image; data/ mounted at
#    /data) to build `ways` / `ways_vertices_pgr`.
# 3. Annotate edges with per-tile threat + a threat-weighted "safe_cost".
#
# Requires: the pgRouting-enabled DB container up. Bbox must match app/domain/theater.py.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ROADS="$ROOT/data/hohenfels-roads.osm"
CONTAINER="${BATTLEFUEL_DB_CONTAINER:-battlefuel-db}"
DB="${BATTLEFUEL_DB_NAME:-battlefuel}"
USER="${BATTLEFUEL_DB_USER:-battlefuel}"
PASS="${BATTLEFUEL_DB_PASSWORD:-battlefuel}"

echo "[1/3] Fetching highways-only OSM extract (nodes-first) via Overpass…"
Q='[out:xml][timeout:180];way[highway](49.18,11.78,49.27,11.92);(._;>;);out body;'
curl -sS --fail -A "BattleFuel/0.1 (dev; OSM ODbL)" \
  --data-urlencode "data=$Q" https://overpass-api.de/api/interpreter -o "$ROADS"
echo "  -> $(du -h "$ROADS" | cut -f1)"

echo "[2/3] osm2pgrouting (in container) → ways / ways_vertices_pgr …"
docker exec "$CONTAINER" osm2pgrouting \
  -f /data/hohenfels-roads.osm -c /usr/share/osm2pgrouting/mapconfig.xml \
  -d "$DB" -U "$USER" -W "$PASS" -h localhost -p 5432 --clean

echo "[3/3] Annotating ways with tile threat + safe_cost …"
(cd "$ROOT/backend" && .venv/bin/python scripts/annotate_routing.py)

echo "Done."
