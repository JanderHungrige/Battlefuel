---
id: 119-threat-grid-code-model
title: Threat grid-code model — own-size footprints, highest-wins nesting
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-21
wave_status: active
depends_on: []
relates: [120-threat-grid-decoupled-render, 121-threat-edge-penalty-by-resolution]
source_files:
  - backend/app/services/threat_grid.py
  - frontend/src/map/threatGrid.ts
routes: []
models: []
test_files:
  - backend/tests/test_threat_grid.py
  - frontend/src/map/threatGrid.test.ts
data_flow: greenfield
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [threat, multi-resolution, grid-code, mgrs, highest-wins, routing]
path: Threat/Model
known_issues:
  - "Base resolution is the threat's own grid code (precision_m): ambient/seeded threat = 1 km (DEFAULT_THREAT_PRECISION_M), located events = their precision_m (100 m–2 km). A 100 m pinpoint event therefore paints/penalises a 100 m square. The conceptual base-cell field (base_cells) uses a caller-chosen base (render/cost use per-footprint squares, which equal base decomposition in the limit)."
---

# 119 — Threat grid-code model

## Purpose

Decouple threat from the **displayed** grid. Today threat colouring (and the routing-edge penalty)
is tied to whatever MGRS grid the operator is viewing, so resizing the grid rescales the threat.
A threat actually has a **coordinate + a size** (its *grid code*), so it should occupy its own
square regardless of what's displayed, and overlapping threats should nest **highest-wins**.

This feature is the shared, pure model that both the map colour ([[120-threat-grid-decoupled-render]])
and the routing-edge penalty ([[121-threat-edge-penalty-by-resolution]]) read — one source of truth,
so colour and cost always agree.

## Model

A **located threat** is `(x, y, level, precision_m)`:

- `level` — integer 0..5.
- `precision_m` — the **grid code**: the side (metres) of the MGRS-aligned square the threat
  occupies. Its **footprint** is the `precision_m` cell holding `(x, y)` (snap-down lattice).
- `(x, y)` — projected **metres** in any single CRS. The module is CRS-agnostic; callers pass UTM
  (PostGIS `EPSG:32632` backend, proj4 zone 32N frontend) so the snapping lattice matches the drawn
  MGRS grid.

**Highest-wins:** `threat_at(x, y, threats)` = the max `level` over every threat whose footprint
covers `(x, y)`. So a 2 km level-2 threat containing a 500 m level-4 patch reads **4** inside the
patch and **2** around it — and **0** outside the 2 km footprint.

**Grid code of a tile threat** ([[120-threat-grid-decoupled-render]] / [[121-threat-edge-penalty-by-resolution]]):
the located event's `precision_m` if the tile carries one, else `DEFAULT_THREAT_PRECISION_M` (1 km,
≈ the H3 res-8 ambient tile). This reuses the existing event category→precision table (Wave 3/4).

## Files

- **`backend/app/services/threat_grid.py`** — pure, dependency-free: `LocatedThreat`, `cell_origin`
  (snap to lattice), `footprint_contains`, `threat_at` (the per-point read edges use), and
  `base_cells` (decompose to a base-resolution field, max per cell — the conceptual "base-cell
  threat field").
- **`frontend/src/map/threatGrid.ts`** — mirror: `DEFAULT_THREAT_PRECISION_M`, `tilePrecisionM(tile)`
  (event precision or ambient default), and `threatSquares(tiles)` → the distinct footprint squares,
  deduped per `(precision, cell)` to the max level and **sorted ascending by level** so a higher
  square paints over a lower one (highest-wins by draw order). Consumed in F2.

## Tests

- Backend `test_threat_grid.py` — snap, footprint containment (half-open bounds), highest-wins
  nesting (2 km/500 m), order-independence, decoupling from a notional display cell, base-cell max.
- Frontend `threatGrid.test.ts` — `tilePrecisionM` (event vs ambient), dedupe-to-max per cell,
  separate own-size squares for nested grid codes, ascending sort.

## Decisions

- **Per-footprint, not a materialised base grid.** Rendering emits one square per threat at its own
  `precision_m`; edges test `threat_at` per midpoint. Both equal base-cell decomposition in the
  limit but scale with threat **count**, not theater **area** — cheaper and exact for nesting.
- **CRS-agnostic metric XY** keeps the model pure and unit-testable; the UTM projection lives in the
  callers (PostGIS / proj4), which already agree on zone 32N, so footprints line up with the MGRS grid.
