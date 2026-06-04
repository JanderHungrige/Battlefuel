---
id: 56-mgrs-cell-aggregation
title: MGRS Cell Aggregation
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-9
wave_status: active
depends_on: [55-mgrs-cell-index]
relates: [57-mgrs-cell-endpoint, 58-mgrs-inspect-panel]
source_files:
  - frontend/src/map/cellSituation.ts
routes: []
models: []
test_files:
  - frontend/src/map/cellSituation.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [mgrs, cell, aggregation, threat, inspection, pure]
path: Map/Inspect
integration_contracts:
  - function: aggregateCell(tiles)
    consumers: [57-mgrs-inspect-panel]
    contract: "The single aggregation rule for an MGRS cell's situation, consumed by the inspect panel. A future backend MGRS-cell endpoint (deferred) must mirror this rule."
satisfies_contracts: []
known_issues:
  - "'Most-recent threat' is deferred: tiles carry no per-tile update timestamp yet, so the cell shows highest threat + count only. A last-updated timestamp is a Wave-5 tiles/panels data concern."
---

# 56 — MGRS Cell Aggregation

## Purpose

The single, pure rule that aggregates the H3 tiles within an MGRS cell into one **cell situation**
for inspection: highest threat, worst road state, max intel, dominant terrain (+ mix), and tile
count. Reused by the inspect panel (`58`) and mirrored by the backend endpoint (`57`).

## Architecture

`frontend/src/map/cellSituation.ts` (pure, no canvas/MapLibre):
- `aggregateCell(tiles)` → `CellSituation { count, maxThreat, worstRoad, maxIntel, dominantTerrain,
  terrainMix }`.

## Data Model

`CellSituation`:
- `count` — tiles in the cell
- `maxThreat` — max `threat_level` (0–5)
- `worstRoad` — worst of `clear < damaged < blocked`
- `maxIntel` — max of `none < low < medium < high`
- `dominantTerrain` — most common terrain (stable tie-break), `unknown` when empty
- `terrainMix` — `Record<TerrainType, count>`

## Business Rules

- Empty input → zeroed situation (`count 0`, `maxThreat 0`, `worstRoad 'clear'`, `maxIntel 'none'`,
  `dominantTerrain 'unknown'`, `terrainMix {}`).
- Worst-case semantics for road/threat/intel (a cell is as dangerous as its worst tile).
- **Most-recent threat deferred** — no per-tile timestamp exists yet (see `known_issues`).

## Data Flow

`58-mgrs-inspect-panel` calls `aggregateCell` on the live displayed tiles within the clicked cell
(grouped by `cellIdFor` from `55`). `57-mgrs-cell-endpoint` mirrors the rule server-side.

## Dependencies

`55-mgrs-cell-index` (cell grouping).

## Security

None — pure function.

## Known Issues

- Most-recent threat deferred (no per-tile timestamp; Wave-5 concern).

## Bugs

(none yet — populated by /mdd bug when issues are reported)
