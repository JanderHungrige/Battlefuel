---
id: 07-hex-tile-model-api
title: Hex Tile Model & API
edition: MDD
depends_on: [05-db-spatial-foundation, 06-osm-theater-data]
relates: [08-unit-instances, 10-map-overlays-inspect]
source_files:
  - backend/app/domain/tile.py
  - backend/app/models/tile.py
  - backend/app/services/tile_grid.py
  - backend/app/services/tile_seed.py
  - backend/app/providers/tiles.py
  - backend/app/api/tiles.py
  - backend/alembic/versions/0002_create_tiles.py
  - backend/scripts/generate_tiles.py
routes:
  - "GET /api/v1/tiles"
  - "GET /api/v1/tiles/{h3_index}"
models:
  - tiles
test_files:
  - backend/tests/test_tiles.py
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [h3, hex-grid, tiles, terrain, postgis, fastapi]
path: Map/Tiles
integration_contracts:
  - function: "GET /api/v1/tiles"
    when: "F10 renders the hex overlay + tile-attribute styling"
satisfies_contracts:
  - from: 05-db-spatial-foundation
    function: "Base / get_session"
    when: "TileRow ORM model + request-scoped reads"
    status: done
    verified_at: "backend/app/models/tile.py:18"
  - from: 06-osm-theater-data
    function: "osm_multipolygons spatial join"
    when: "terrain derivation in tile_seed"
    status: done
    verified_at: "backend/app/services/tile_seed.py:20"
security_read_sites: []
known_issues:
  - "Terrain derivation uses a coarse OSM landuse/natural mapping; refine as the game needs richer terrain."
  - "Non-terrain attributes (threat/intel/weather/road/cover) start at defaults; mutated by later waves."
sister_projects: []
---

# 07 — Hex Tile Model & API

## Purpose
Lays the H3 hex grid over the theater and exposes tiles with their game attributes. Each
tile is the atomic unit of terrain the game reasons about (movement, fuel, threat). H3 is
the spatial index — no stored geometry needed.

## Architecture
- `domain/tile.py` — attribute enums (terrain, intel, weather, road, cover) + the `Tile`
  schema (with H3-derived boundary).
- `models/tile.py` — `TileRow` ORM (`tiles` table).
- `services/tile_grid.py` — pure H3 grid generation (`generate_cells`, res 8 default).
- `services/tile_seed.py` — idempotent grid population + terrain derivation via spatial
  join to `osm_multipolygons`.
- `providers/tiles.py` — `TileDataProvider` interface + `DbTileProvider` + factory.
- `api/tiles.py` — `/tiles` (bbox-filterable) and `/tiles/{h3_index}`.
- `scripts/generate_tiles.py` — one-shot grid+terrain seeding (146 tiles for Hohenfels).

## Data Model
`tiles`: `h3_index` (PK), `resolution`, `center_lat/lon`, `terrain`, `threat_level` (0–5),
`intel_level`, `weather`, `road_condition`, `cover`.

## API Endpoints
- `GET /api/v1/tiles?bbox=west,south,east,north` → `Tile[]` (bad bbox → 422).
- `GET /api/v1/tiles/{h3_index}` → `Tile` (200) or 404.

## Business Rules
- Grid covers the theater bbox at the configured H3 resolution (default 8 → 146 tiles).
- Terrain = smallest OSM polygon containing the tile center, mapped to a `TerrainType`;
  unmatched tiles default to `open`.

## Data Flow
H3 cells → `tiles` rows (insert ON CONFLICT DO NOTHING) → terrain UPDATE via PostGIS
spatial join → API reads via `DbTileProvider` → `Tile` JSON (boundary derived from H3).

## Dependencies
- `05-db-spatial-foundation` (DB/session), `06-osm-theater-data` (osm_multipolygons).

## Security
Read-only endpoints. `bbox` is parsed/validated (→ 422 on malformed input); `h3_index` is
a primary-key lookup (no injection surface). No external writes from the API.

## Known Issues
See frontmatter `known_issues`.

## Bugs
(none yet — populated by /mdd bug when issues are reported)
