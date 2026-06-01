---
generated: 2026-06-01
doc_count: 10
connection_count: 14
overlap_count: 0
---

# MDD Connections

## Path Tree

```
Map/
├── Frontend
│   ├── 09-frontend-map-shell      complete
│   └── 10-map-overlays-inspect    complete
├── Theater
│   └── 06-osm-theater-data        complete
└── Tiles
    └── 07-hex-tile-model-api      complete
Platform/
└── Database
    └── 05-db-spatial-foundation   complete
Units/
├── API
│   └── 04-unit-query-api          complete
├── Catalog
│   ├── 01-unit-stats-model        complete
│   └── 03-seed-unit-catalog       complete
├── DataSource
│   └── 02-data-source-factory     complete
└── Instances
    └── 08-unit-instances          complete
```

## Dependency Graph

```mermaid
graph TD
    d01["01-unit-stats-model"]:::complete
    d02["02-data-source-factory"]:::complete
    d03["03-seed-unit-catalog"]:::complete
    d04["04-unit-query-api"]:::complete
    d05["05-db-spatial-foundation"]:::complete
    d06["06-osm-theater-data"]:::complete
    d07["07-hex-tile-model-api"]:::complete
    d08["08-unit-instances"]:::complete
    d09["09-frontend-map-shell"]:::complete
    d10["10-map-overlays-inspect"]:::complete

    d02 --> d01
    d03 --> d02
    d03 --> d01
    d04 --> d02
    d04 --> d01
    d06 --> d05
    d07 --> d05
    d07 --> d06
    d08 --> d05
    d08 --> d01
    d09 --> d06
    d10 --> d09
    d10 --> d07
    d10 --> d08

    classDef complete fill:#00e5cc,color:#000
    classDef in_progress fill:#ffaa00,color:#000
    classDef draft fill:#888,color:#fff
    classDef deprecated fill:#555,color:#aaa
```

## Source File Overlap

(none — no source file is the primary subject of 2+ docs; `backend/app/main.py` is the
shared app factory, updated incrementally as routers are added)

## Warnings

(none — all depends_on refs resolve, no cycles, all docs have a path)
