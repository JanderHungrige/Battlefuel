---
id: 06-osm-theater-data
title: OSM Theater Data & Offline Basemap
edition: MDD
depends_on: [05-db-spatial-foundation]
relates: [07-hex-tile-model-api, 09-frontend-map-shell]
source_files:
  - backend/app/domain/theater.py
  - backend/scripts/build_basemap.sh
  - backend/scripts/import_osm_to_postgis.sh
  - data/hohenfels.pmtiles
routes: []
models: []
test_files:
  - backend/tests/test_theater_basemap.py
data_flow: writes-existing
last_synced: 2026-05-31
status: complete
phase: all
mdd_version: 11
tags: [osm, pmtiles, hohenfels, theater, maplibre, gdal, tippecanoe]
path: Map/Theater
integration_contracts:
  - function: "app.domain.theater.HOHENFELS"
    when: "hex-grid extent (F07) and frontend initial view (F09) read the bbox/center"
  - function: "data/hohenfels.pmtiles + osm_* PostGIS tables"
    when: "F09 renders the basemap; F07 derives tile terrain from osm_multipolygons"
satisfies_contracts: []
security_read_sites: []
known_issues:
  - "GDAL OSM driver emits 'Non increasing node id' warnings during import; output is still produced (fallback indexing). Harmless for our use."
  - "Map data © OpenStreetMap contributors (ODbL) — attribution required wherever the basemap is shown/redistributed."
sister_projects: []
---

# 06 — OSM Theater Data & Offline Basemap

## Purpose
Produces the offline map substrate for the Hohenfels seed theater: a single-file PMTiles
vector basemap for MapLibre, plus the raw OSM features imported into PostGIS for tile
terrain derivation. Also defines the shared `Theater` config (bbox/center) used across
backend and frontend.

## Architecture
- `app/domain/theater.py` — `BBox` + `Theater` (frozen, validated) and the `HOHENFELS`
  instance (bbox 11.78,49.18 → 11.92,49.27).
- `scripts/build_basemap.sh` — Overpass extract → GeoJSON (GDAL `ogr2ogr`) → vector tiles
  (`tippecanoe`, zooms 6–16, layers `roads`/`areas`/`places`) → `data/hohenfels.pmtiles`.
- `scripts/import_osm_to_postgis.sh` — `ogr2ogr` loads `osm_points` / `osm_lines` /
  `osm_multipolygons` into PostGIS.
- `data/hohenfels.pmtiles` — 913 KB, committed so the app runs offline out-of-the-box.

## Data Model
PostGIS tables `osm_points`, `osm_lines`, `osm_multipolygons` (GDAL-generated; geometry +
OSM tags). Consumed read-only by Feature 07 for terrain.

## API Endpoints
None (data/tooling feature). The basemap is a static asset served to the frontend in F09.

## Business Rules
- Theater bbox in the script must match `HOHENFELS.bbox`.
- Intermediates (`.osm`, `*.geojson`) are gitignored; the `.pmtiles` is committed.

## Data Flow
Overpass → OSM XML → (GDAL) GeoJSON → (tippecanoe) PMTiles; and OSM XML → (GDAL) PostGIS.
Frontend reads the PMTiles; F07 reads the PostGIS tables.

## Dependencies
- `05-db-spatial-foundation` — PostGIS to import into.

## Security
No runtime user input. Build scripts fetch from the public Overpass API with a descriptive
User-Agent. OSM attribution (ODbL) is embedded in the tiles and must be shown in the UI.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
