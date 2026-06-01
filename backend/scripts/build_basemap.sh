#!/usr/bin/env bash
# Build the offline Hohenfels basemap: Overpass extract -> GeoJSON (GDAL) ->
# vector tiles (tippecanoe) -> single .pmtiles file.
#
# Output: data/hohenfels.pmtiles (committed; small). Intermediates (.osm, *.geojson)
# are gitignored. Re-run to regenerate. Requires: curl, ogr2ogr (GDAL), tippecanoe.
#
# Map data © OpenStreetMap contributors, ODbL.
set -euo pipefail

# Hohenfels bbox — must match app/domain/theater.py HOHENFELS.
WEST=11.78; SOUTH=49.18; EAST=11.92; NORTH=49.27

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DATA="$ROOT/data"
mkdir -p "$DATA"
OSM="$DATA/hohenfels.osm"
PMTILES="$DATA/hohenfels.pmtiles"

echo "[1/4] Fetching OSM extract via Overpass (bbox $SOUTH,$WEST,$NORTH,$EAST)..."
QUERY="[out:xml][timeout:120];( node($SOUTH,$WEST,$NORTH,$EAST); way($SOUTH,$WEST,$NORTH,$EAST); relation($SOUTH,$WEST,$NORTH,$EAST); ); out body; >; out skel qt;"
curl -sS --fail -A "BattleFuel/0.1 (dev; OSM ODbL)" \
  --data-urlencode "data=$QUERY" \
  https://overpass-api.de/api/interpreter -o "$OSM"
echo "  -> $(du -h "$OSM" | cut -f1) $OSM"

echo "[2/4] Converting OSM layers to GeoJSON (GDAL)..."
ogr2ogr -f GeoJSON -overwrite "$DATA/lines.geojson" "$OSM" lines
ogr2ogr -f GeoJSON -overwrite "$DATA/multipolygons.geojson" "$OSM" multipolygons
ogr2ogr -f GeoJSON -overwrite "$DATA/points.geojson" "$OSM" points

echo "[3/4] Building vector tiles (tippecanoe -> PMTiles)..."
tippecanoe -o "$PMTILES" --force -Z6 -z16 --drop-densest-as-needed \
  -n "Hohenfels basemap" -A "© OpenStreetMap contributors (ODbL)" \
  -L roads:"$DATA/lines.geojson" \
  -L areas:"$DATA/multipolygons.geojson" \
  -L places:"$DATA/points.geojson"

echo "[4/4] PMTiles summary:"
pmtiles show "$PMTILES" | head -20
echo "Done: $PMTILES"
