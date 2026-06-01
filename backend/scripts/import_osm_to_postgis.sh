#!/usr/bin/env bash
# Import the Hohenfels OSM extract into PostGIS as osm_points / osm_lines /
# osm_multipolygons. Feature 07 (hex tiles) derives tile terrain from these via
# spatial queries. Run build_basemap.sh first (it produces data/hohenfels.osm).
#
# Requires: ogr2ogr (GDAL). DB connection via BATTLEFUEL_OGR_PG or the dev default.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
OSM="$ROOT/data/hohenfels.osm"
PG="${BATTLEFUEL_OGR_PG:-PG:host=localhost port=5432 user=battlefuel password=battlefuel dbname=battlefuel}"

if [ ! -f "$OSM" ]; then
  echo "error: $OSM not found — run build_basemap.sh first" >&2
  exit 1
fi

for layer in points lines multipolygons; do
  echo "Importing $layer -> osm_$layer ..."
  ogr2ogr -f PostgreSQL "$PG" "$OSM" "$layer" \
    -nln "osm_$layer" -lco GEOMETRY_NAME=geom -nlt PROMOTE_TO_MULTI -overwrite
done
echo "Done."
