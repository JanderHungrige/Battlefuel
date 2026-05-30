---
generated: 2026-05-30
doc_count: 4
connection_count: 4
overlap_count: 0
---

# MDD Connections

## Path Tree

```
Units/
├── API
│   └── 04-unit-query-api          complete
├── Catalog
│   ├── 01-unit-stats-model        complete
│   └── 03-seed-unit-catalog       complete
└── DataSource
    └── 02-data-source-factory     complete
```

## Dependency Graph

```mermaid
graph TD
    d01["01-unit-stats-model"]:::complete
    d02["02-data-source-factory"]:::complete
    d03["03-seed-unit-catalog"]:::complete
    d04["04-unit-query-api"]:::complete

    d02 --> d01
    d03 --> d02
    d03 --> d01
    d04 --> d02
    d04 --> d01

    classDef complete fill:#00e5cc,color:#000
    classDef in_progress fill:#ffaa00,color:#000
    classDef draft fill:#888,color:#fff
    classDef deprecated fill:#555,color:#aaa
```

## Source File Overlap

(none — no source file is referenced by 2+ docs)

## Warnings

(none — all depends_on refs resolve, no cycles, all docs have a path)
