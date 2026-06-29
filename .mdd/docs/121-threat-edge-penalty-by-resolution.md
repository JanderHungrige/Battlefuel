---
id: 121-threat-edge-penalty-by-resolution
title: Routing-edge threat penalty read at the threat's own resolution
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-21
wave_status: active
depends_on: [119-threat-grid-code-model]
relates: [119-threat-grid-code-model, 120-threat-grid-decoupled-render]
source_files:
  - backend/app/services/routing_graph.py
routes: []
models: []
test_files:
  - backend/tests/test_routing_graph.py
  - backend/tests/test_threat_grid.py
data_flow: writes-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [threat, routing, pgrouting, safe-cost, multi-resolution, footprint, utm]
path: Threat/Routing
known_issues:
  - "annotate_cell re-costs every edge within RECOST_RADIUS_M (3 km) of a changed tile, recomputing over all current threats — correct and targeted (vs a full re-annotation) but it may re-write some edges whose value is unchanged. Acceptable for infrequent operator/feed mutations in a single-user sim."
  - "Footprint threat uses UTM EPSG:32632 to match the frontend MGRS grid. The F3 wiring is covered by a @pytest.mark.db test (stored edge threat == footprint model) and verified read-only against the dev DB; the live SAFE-route-bends-around-the-right-cell behaviour is confirmed at the make dev gate."
---

# 121 — Threat edge penalty by resolution

## Purpose

Make the routing-edge threat penalty read threat at the **correct resolution**, from the same
footprint field the map colours ([[119-threat-grid-code-model]] / [[120-threat-grid-decoupled-render]]).
Before this, every edge took the single `tiles.threat_level` of the one H3 cell its midpoint mapped
to (at `DEFAULT_RESOLUTION`) — there was no notion of a threat's own footprint size, so cost and
the rendered colour could disagree and a small high-threat patch didn't penalise the right edges.

## Change (`routing_graph.py`)

An edge's effective threat is now `max(footprint threat at the midpoint, enemy-proximity threat)`:

- **Footprint threat** = `threat_grid.threat_at(ux, uy, threats)` — highest-wins over every threat
  whose grid-code square covers the edge midpoint. Threats are loaded from tiles with
  `threat_level > 0`, each carrying its grid code (`last_event.precision_m`, else the 1 km ambient
  default) — identical to the frontend rule, so **cost and colour read the same square**.
- **UTM (EPSG:32632)** coordinates for both edge midpoints and threat tile centres come from PostGIS
  `ST_Transform`, so the snapping lattice matches the drawn MGRS grid (zone 32N). The threat model
  itself stays pure metric-XY.
- **Terrain / road** (speed/fuel) still come from the edge's own H3 cell — unchanged; only the
  threat channel moved to footprints.

`annotate_ways` re-costs the whole graph this way. `annotate_cell` (the live per-mutation re-cost)
now re-costs **every edge whose midpoint is within `RECOST_RADIUS_M` (3 km) of the changed tile**,
recomputing over all current threats — because a threat paints up to a ~2 km footprint, a tile
change can affect edges beyond its own H3 cell, and a removed/lowered threat must un-penalise edges
a larger overlapping threat no longer shadows.

## Tests

- `test_routing_graph.py` — new `@pytest.mark.db` test: after `annotate_ways`, every sampled edge's
  persisted `threat_level` equals `threat_at(midpoint)` over the located threats (the wiring is
  correct), and at least one edge is threatened by a footprint.
- `test_threat_grid.py` (F1) — the highest-wins footprint logic the edges read.
- `test_tile_mutation.py` — exercises `annotate_cell` via `apply_tile_mutation` (still green with
  the footprint-aware re-cost).

## Verification

Lint + `mypy app` clean; affected suites green. Read-only check against the dev DB (2689 edges, 40
threat tiles): footprint threat extends each threat across its MGRS square — threatened edges rose
676 → 962, and edges near a grid boundary correctly drop (their H3 cell had threat but the footprint
does not cover the midpoint) — exactly matching the rendered colour.
