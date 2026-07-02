---
id: battlefuel-v2-wave-21
title: "Wave 21: Multi-resolution threat model — threat at its own grid size + enemy danger circles"
initiative: battlefuel-v2
initiative_version: 11
status: complete
depends_on: battlefuel-v2-wave-19
demo_state: "Threat is decoupled from the displayed grid. A threat colours the grid that matches its OWN size/location regardless of the grid the operator is viewing — a 500 m threat colours its 500 m cell even on the 1 km grid (¼ of the cell), not the whole displayed cell. Nesting is highest-threat-wins: a 2 km level-2 threat containing a 500 m level-4 patch shows level 4 in that 500 m patch and level 2 around it. Routing-edge penalties read the threat at the correct resolution (an edge crossing a threatened cell gets that cell's penalty, derived from the threat's grid code). When an enemy unit appears, a 500 m-radius circle is drawn around it and all affected 500 m cells are coloured red."
created: 2026-06-26
hash: 7cf8b8e9
---

# Wave 21: Multi-resolution threat model

> **Requested 2026-06-26 (brain-dump batch).** Today threat colouring is tied to the displayed
> grid, so changing grid size rescales the threat. Threats actually have a coordinate + size, so
> they should paint their own grid resolution independent of what's displayed, nest highest-wins,
> and feed the routing graph at the right resolution.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [x] **tested local** — `make dev`, demoed on localhost
- [x] **tested online** — on `dev-deployment`, deployed to `:3001`, verified
- [x] **merged into main / deployed in prod** — in `main` (merge `e9ff0b2`), rolling to `:3000`

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | threat-grid-code-model | docs/119-threat-grid-code-model.md | complete | — |
| 2 | threat-grid-decoupled-render | docs/120-threat-grid-decoupled-render.md | complete | threat-grid-code-model |
| 3 | threat-edge-penalty-by-resolution | docs/121-threat-edge-penalty-by-resolution.md | complete | threat-grid-code-model |
| 4 | enemy-danger-circle-render | docs/122-enemy-danger-circle-render.md | complete | threat-grid-decoupled-render |

Build order: 1 → {2, 3}; 4 after 2.

### Current state (code investigation 2026-06-26)
- **Threat lives on H3 tiles** (`tiles.threat_level`) and is rendered as MGRS squares at the
  displayed precision (Wave 3/9, `frontend/src/map/`); the colour follows the displayed grid, so
  resizing the grid rescales the wash — this is the bug to fix.
- **Edge penalty reads the single tile threat at `DEFAULT_RESOLUTION`** — `routing_graph.py`
  maps each edge midpoint to one H3 cell and uses that cell's `threat_level` (+ enemy proximity)
  in `safe_cost`. There is no notion of a threat's own footprint size.
- **Enemy proximity already feeds routing** (`enemy_danger.enemy_threat_at`, echelon-scaled,
  Wave 16) but is **not** rendered as a coloured danger circle on the map.

### Recommended approach (decided 2026-06-26)
**Decompose each threat by its grid code into the base (smallest, e.g. 100 m) cells it covers and
take the max per base cell ("highest wins").** Rendering and edge-penalty both read the base-cell
threat field and aggregate up to whatever resolution they need. This answers the requester's
question ("does routing check the smallest grid, or each level?"): edges resolve their threat from
the base-cell field, so a single consistent source drives both colour and cost, and the grid code
of a threat determines exactly which base cells it occupies. (Alternative — per-edge polygon tests
at each threat's own size — is left as the fallback if base-cell decomposition is too coarse.)

### Feature notes (requester 2026-06-26)
- **F1 threat-grid-code-model** — give each threat a grid code / size + location (MGRS-aligned)
  and a function that expands it to the base cells it covers; aggregate overlapping threats with
  max (highest wins).
- **F2 threat-grid-decoupled-render** — render threat at its own resolution regardless of the
  displayed grid (500 m threat → 500 m square inside a 1 km cell), with highest-wins nesting.
- **F3 threat-edge-penalty-by-resolution** — edges read threat from the base-cell field so an edge
  crossing a threatened cell gets that cell's penalty at the right resolution; keep `cost_model`
  the single source of truth and re-cost affected cells (`annotate_cell`) on threat change.
- **F4 enemy-danger-circle-render** — when an enemy unit appears, draw a 500 m-radius circle and
  colour all affected 500 m cells red (display layer; complements the existing routing-side
  enemy danger from Wave 16).

## Open Research (resolve at plan-time)
- Base resolution choice (100 m / H3 res) and storage: a base-cell threat field/table vs computed
  on the fly; how it reconciles with the existing `tiles.threat_level`.
- How event-driven threats (Wave 3/4 located events with per-category precision) map onto grid
  codes — reuse the category→precision table.
- Render performance with many small cells; whether to aggregate client-side from live tile data
  (as Wave 9 does) or add a backend layer.
