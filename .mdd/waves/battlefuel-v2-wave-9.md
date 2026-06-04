---
id: battlefuel-v2-wave-9
title: "Wave 9: MGRS-Native Inspection — Retire the Hex Tile from the UX"
initiative: battlefuel-v2
initiative_version: 3
status: complete
depends_on: battlefuel-v2-wave-3
demo_state: "The operator inspects the battlefield purely in MGRS: clicking the map selects the MGRS cell at the current grid precision, and the panel reports that cell's MGRS coordinate plus its aggregated situation (highest threat, terrain mix, road state, intel, units in the cell) — with no hex/H3 vocabulary anywhere in the UI. Aggregation runs client-side from the live tile data; a backend MGRS-cell data layer is deferred to a future data wave, and terrain routing stays on H3."
created: 2026-06-03
hash: ae280df7
---

# Wave 9: MGRS-Native Inspection — Retire the Hex Tile from the UX

## Done-When (close-out gate) — ✅ CLOSED 2026-06-03 (local + online verified; prod deferred)
Per the initiative's Wave Definition of Done. **Deploy note:** this wave is the one that finally
takes **Wave 3 + Wave 9 together onto `dev-deployment` (:3001)** — Wave 3's dev/prod gates were
deliberately deferred to batch here.

- [x] **tested local** — `make dev`, MGRS-cell inspection + no-hex UX verified on localhost
- [x] **tested online** — verified on `:3001` (W3 + W9 together), 2026-06-03
- [ ] **merged into main / deployed in prod** — DEFERRED (requester): wave closed now; prod merge to `main` (:3000) later, needs approval

> Frontend prod-build caveat: smoke-test the **minified** build (`vite preview` + headless), not
> just `make dev`.

## Demo-State
Inspection is **MGRS-native**: clicking the map selects the **MGRS cell at the current grid
precision** and the panel shows its **MGRS coordinate** + **aggregated situation** (highest &
most-recent threat, terrain mix, road state, intel, units in the cell). **No hex / H3 vocabulary**
remains in the operator UI. Aggregation runs **client-side** from the live tile data; the **backend
MGRS-cell data layer is deferred** to a future data wave, and **terrain routing stays on H3**.

*(Not complete until demonstrated — see Done-When gate.)*

## Scope

**Hybrid** (requester decision, 2026-06-03): make the operator experience MGRS-native now, and
*start* migrating data to MGRS (threat), while **keeping H3 as the internal substrate** — especially
for terrain routing, which is explicitly out of scope here and handled in the later routing/movement
wave. H3 remains the source of truth for tile data; this wave adds an MGRS *view/aggregation* on top
and removes hex from what the operator sees.

**Locked inputs / resolved decisions (2026-06-03):**
- **Depth = Hybrid (backend step deferred).** MGRS-native inspection now (client-side); the first
  backend MGRS-cell data representation is **deferred to a future data wave** (needs a server-side
  UTM/MGRS dep; not on the inspection path). Do **not** migrate the routing graph or tile generation.
- **Inspect target = the MGRS cell at the current grid precision.** Clicking aggregates the
  underlying H3 tiles that fall within the selected MGRS square (the same square the grid draws).
- **Remove hex from the UX surface.** Drop all hex/H3 vocabulary the operator sees — the archived
  `GridLayout` `'hex'` toggle + `applyGridLayout` hex branch, `h3_index` shown in panels, any
  hex/“sector” labels. The internal H3 data layer may stay.

**Out of scope (later waves):**
- Routing/movement engine + UX, unit-stall-on-blocked-tile fix → **routing/movement overhaul wave**.
- Full migration of tile generation / routing graph to MGRS → not planned (H3 stays the substrate).
- Events/chatter overhaul, tiles/panels rework, scenario, landing → original **W4–W8**.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | mgrs-cell-index        | docs/55-mgrs-cell-index.md | complete | — |
| 2 | mgrs-cell-aggregation  | docs/56-mgrs-cell-aggregation.md | complete | mgrs-cell-index |
| 3 | mgrs-inspect-panel     | docs/57-mgrs-inspect-panel.md | complete | mgrs-cell-aggregation |
| 4 | mgrs-threat-shading    | docs/58-mgrs-threat-shading.md | complete | mgrs-cell-aggregation |
| 5 | retire-hex-ux          | docs/59-retire-hex-ux.md | complete | mgrs-threat-shading |

> **Deferred:** the original F3 `mgrs-cell-endpoint` (backend `GET /api/v1/mgrs-cells`) is **deferred
> to a future data-migration wave** (requester decision 2026-06-03) — it needs a server-side
> UTM/MGRS dependency the backend lacks and is not on the inspection critical path (the panel
> aggregates client-side from live tile data). Logged in `TODO.md`. Wave 9 is therefore MGRS-native
> inspection done **client-side**; the backend data layer stays H3 for now.

**Build order:** 1 → 2 → 3 → 4 → 5 (4 shades MGRS cells by threat — the threat-first migration that
replaces the hex wash; 5 removes the now-unused hex surface last).

### Feature notes
- **mgrs-cell-index** (frontend pure) — extend `mgrsGrid.ts`: `cellIdFor(lat,lon,precisionM)` +
  `cellMgrsLabel`. Unit-tested, no canvas. ✅
- **mgrs-cell-aggregation** (pure) — `aggregateCell(tiles)` → cell situation (max threat, worst road,
  max intel, dominant terrain + mix, count). The single aggregation rule. ✅ (Most-recent threat
  deferred — no per-tile timestamp; Wave-5 concern.)
- **mgrs-inspect-panel** (frontend) — clicking resolves the MGRS cell at the active precision
  (`cellIdFor`); the inspect panel shows its MGRS coordinate (`cellMgrsLabel`) + aggregated
  attributes (`aggregateCell` over the live displayed tiles in the cell) + units in the cell; remove
  the `h3_index` display. Reflects live `tile_update` data (client-side aggregation). Keep selection
  single-focus with the Wave-3 combat-square / chatter highlights.
- **mgrs-threat-shading** (frontend) — aggregate tile threat per MGRS cell (`cellIdFor` +
  `aggregateCell` maxThreat) and shade those squares red by threat; a new `cell-threat` MapLibre fill
  layer fed from the displayed tiles + active precision. Replaces the hex threat wash — the "Hybrid,
  threat-first" migration to MGRS (still client-side; backend data layer deferred).
- **retire-hex-ux** (frontend) — remove the archived hex `GridLayout` option + `applyGridLayout`
  hex branch + `gridLayout` prop (always MGRS); hide the now-redundant hex threat wash + the hex
  click-outline (route sector-chatter locate to an MGRS square); strip hex/H3 vocabulary. MGRS-only.

## Open Research
- **Where aggregation runs** — client-side (uses the live tile data the frontend already holds, no
  round-trip) vs the backend endpoint (feature 3). Decide whether the panel (4) consumes the
  endpoint (3) or aggregates client-side, so the aggregation rule isn't duplicated. Leaning:
  client-side for the panel (live, fast), endpoint as the forward-looking authoritative seed.
- **Threat semantics** — reconcile the MGRS-cell aggregated threat with (a) the H3 tile threat wash
  and (b) the Wave-3 combat-event squares, so threat isn't double-counted or confusingly split.
- **Live updates** — `tile_update` frames change threat over time; MGRS-cell inspection must reflect
  them (client-side agg gets this free; the endpoint would need refetch-on-tick like supply).
- **Hex-retirement inventory** — confirm the archived `GridLayout 'hex'` type, `applyGridLayout` hex
  branch, and `h3_index` references in panels/labels are not load-bearing before removing them.
- **Units-in-cell** — map unit positions to MGRS cells for the panel's "units in cell".
- **Precision coupling** — inspection uses the active grid-precision selector; define behaviour when
  the operator changes precision while a cell is selected (re-resolve vs clear).
