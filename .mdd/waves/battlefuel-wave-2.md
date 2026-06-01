---
id: battlefuel-wave-2
title: "Wave 2: Offline Map & Grid"
initiative: battlefuel
initiative_version: 3
status: complete
depends_on: battlefuel-wave-1
demo_state: "Open the BattleFuel web app and see the offline Hohenfels map with a hex grid overlay; tiles show attributes; placed units render with APP-6 NATO symbols; click any tile or unit to inspect it."
created: 2026-05-31
hash: b283c2b1
---

# Wave 2: Offline Map & Grid

## Demo-State
Open the BattleFuel web app and see the **offline Hohenfels map** with a **hex grid
overlay**; tiles show attributes; placed units render with **APP-6 NATO symbols**; click
any tile or unit to inspect it.
*(This wave is not complete until this can be manually demonstrated.)*

## Scope
This wave builds the spatial foundation: a real PostgreSQL + PostGIS database (Docker),
the offline basemap, an H3 hex grid with tile attributes, placed unit *instances*, the
React + MapLibre frontend, and inspect interaction. **Movement/routing is Wave 3** — units
here are placed but do not move yet.

Locked inputs (from the initiative): backend **FastAPI + PostgreSQL/PostGIS**, frontend
**React + MapLibre GL**, hex grid via **Uber H3**, offline basemap as **PMTiles**, seed
theater **Hohenfels, Germany**, symbology **APP-6 via `milsymbol`**, single-user
server-authoritative.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | db-spatial-foundation | docs/05-db-spatial-foundation.md | complete | — |
| 2 | osm-theater-data | docs/06-osm-theater-data.md | complete | db-spatial-foundation |
| 3 | hex-tile-model-api | docs/07-hex-tile-model-api.md | complete | osm-theater-data |
| 4 | unit-instances | docs/08-unit-instances.md | complete | db-spatial-foundation |
| 5 | frontend-map-shell | docs/09-frontend-map-shell.md | complete | osm-theater-data |
| 6 | map-overlays-inspect | docs/10-map-overlays-inspect.md | complete | hex-tile-model-api, unit-instances, frontend-map-shell |

Build order: 1 → 2 → {3, 4} → 5 → 6.

### Feature notes
- **db-spatial-foundation** — Docker Compose Postgres+PostGIS; SQLAlchemy 2.0 (async) +
  Alembic; spatial base schema and SRID convention; DB-backed settings. The data factory
  from Wave 1 gains DB-backed providers alongside the seed provider.
- **osm-theater-data** — select & document the Hohenfels bounding box; import the OSM
  extract into PostGIS; generate the offline **PMTiles** basemap + MapLibre style.
- **hex-tile-model-api** — generate the H3 hex grid over the theater; tile-attribute schema
  (terrain, threat, recon, weather, road condition, cover, …) with terrain seeded from OSM
  tags; tile provider behind the factory; `GET /api/v1/tiles` (bbox/by-id).
- **unit-instances** — placed unit instance model (references a Wave 1 `UnitType` + position
  + operational status); instance provider; `GET /api/v1/units/instances`; a seed scenario
  placing a few units in the theater for the demo.
- **frontend-map-shell** — React + TypeScript + Vite; MapLibre GL rendering the offline
  PMTiles basemap; app shell and API client.
- **map-overlays-inspect** — hex grid overlay with tile-attribute styling; unit instances
  rendered as APP-6 symbols via `milsymbol`; click-to-inspect side panels for tiles and units.

## Open Research
- **Import/PMTiles toolchain** — confirm OSM→PostGIS importer (osm2pgsql vs ogr2ogr) and the
  PMTiles generation pipeline (planetiler vs tippecanoe + `pmtiles convert`).
- **H3 resolution** — pick the resolution giving game-appropriate hex size over Hohenfels
  (~160 km²); e.g. res 8 (~0.7 km²/hex) vs res 9 (~0.1 km²/hex) — balance granularity vs count.
- **OSM → terrain mapping** — define how OSM `landuse`/`natural`/`highway` tags map to the
  tile `terrain` attribute; non-terrain attributes (threat/recon/weather) start at defaults.
- **Projection/SRID** — confirm PostGIS storage SRID (4326) and any reprojection for tiles/H3.
- **Unit placement** — how demo instances are seeded/positioned within the theater.
