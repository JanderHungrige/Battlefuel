---
id: battlefuel-v2-wave-2
title: "Wave 2: Map Foundations — Classic Light Theater, Framed Grid & MGRS Layout"
initiative: battlefuel-v2
initiative_version: 2
status: planned
depends_on: battlefuel-v2-wave-1
demo_state: "The map reads as a lighter, classic offline theater framed within the viewport with crisp, non-overlapping hexes; the indicator accent is #FFD9BD and a selected unit is shown in a darker blue. A grid-layout setting switches the map between the H3 hex grid and an MGRS grid (default) — the MGRS grid draws standard squares at a selectable precision (100 km / 10 km / 1 km / 100 m, default 1 km) with MGRS labels, and hovering/clicking reports a full MGRS coordinate down to 1 m."
created: 2026-06-03
hash: ef1cee6d
---

# Wave 2: Map Foundations — Classic Light Theater, Framed Grid & MGRS Layout

## Done-When (close-out gate)
Track in this doc; mark `complete` only after all three pass (see initiative DoD):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — `dev-deployment` → `:3001`, verified there
- [ ] **merged into main / deployed in prod** — `:3000`, verified → then close

## Demo-State
A lighter, **classic** offline map (no legend), with the theater **framed** in the viewport and
**crisp non-overlapping hexes**. The indicator accent is **#FFD9BD** (was cyan) and a **selected
unit** stands out in a **darker blue**. A **grid-layout setting** lets the operator switch between
the **H3 hex grid** and an **MGRS grid** (the default): the MGRS grid draws standard squares at a
**selectable precision** (100 km / 10 km / 1 km / 100 m — default **1 km**) with MGRS labels, and
hover/click reports a **full MGRS coordinate to 1 m**.
*(Frontend-only wave. Not complete until demonstrated live — see Done-When gate.)*

## Scope
Pure **frontend** (TypeScript + React + MapLibre GL) optics/UX foundations on the existing offline
PMTiles basemap + H3 tile data. No backend/data-model change (MGRS is derived client-side from
lat/lon; the H3 hexes remain the authoritative data layer for terrain/threat).

**Locked inputs / resolved decisions (2026-06-03):**
- **Classic light style** over the existing offline PMTiles (lighter + classic, **no legend** —
  remove the current `TerrainLegend` panel). No external style reference.
- **Framed map**: bound the viewport to the theater bbox (`maxBounds`) with a visible frame/border;
  hexes render crisp and non-overlapping on the light base.
- **Grid layout is selectable**: **MGRS grid (default)** ↔ **H3 hex grid (alternate)**. Switching
  **replaces** the other (not an overlay). The hex grid stays the data-carrying layer (terrain/
  threat); tile **click/hover still resolves to the underlying H3 tile** regardless of which grid is
  drawn — the MGRS grid is a coordinate/reference layer.
- **MGRS precision selector** controls the **drawn** square size: **100 km / 10 km / 1 km / 100 m**
  (default **1 km**). Finer levels are **not drawn** (a 10 m/1 m grid is solid ink at theater scale);
  instead the **coordinate readout** (hover/click + tile panel) always reports a full MGRS string to
  **1 m** precision (e.g. `32U PU 12345 67890`).
- **MGRS conversion** via a **bundled offline JS library** (e.g. `mgrs`); theater is in **UTM zone
  32U** (single zone — simplifies grid-line generation).
- **Offline labels**: MGRS labels render via a **self-hosted glyph (font PBF)** symbol layer
  (the basemap currently disables glyphs for offline use, so a glyph source must be bundled).
- **Accent recolour** cyan `#00e5cc` → **#FFD9BD** (`--accent` CSS var **and** the 3 hardcoded map
  literals in `MapView.tsx`); **selected unit** rendered in a **darker blue** (new highlight layer —
  no selected-state styling exists today).

**Out of scope (later waves):** richer threat symbology, red combat zones, blocked-area colours,
hover icons, enemy/red NATO units, correct OF-8 depot symbol + fuel bars → **Wave 3**. Routing UX
(multiple routes, manual waypoints, on/off-road UI toggle) → **Wave 6**. 3D/DEM elevation → Advanced.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | classic-map-style          | docs/45-classic-map-style.md | active | — |
| 2 | framed-map-and-hexes       | docs/46-framed-map-and-hexes.md | active | classic-map-style |
| 3 | mgrs-grid-layout           | — | planned | framed-map-and-hexes |
| 4 | accent-and-selection-restyle | docs/48-accent-and-selection-restyle.md | active | classic-map-style |

Build order: 1 → 2 → 3 → 4 (4 may follow 1 independently of 2–3).

### Feature notes
- **classic-map-style** — replace the dark `buildBasemapStyle` palette (`src/map/basemapStyle.ts`,
  bg `#0e1116`) with a lighter, classic cartographic palette over the same PMTiles vector source;
  retune the terrain/area/road fill colours for a light base. **Remove** the static `TerrainLegend`
  panel (and its `.legend` CSS). Keep the pure-function/style-builder split so `basemapStyle.test.ts`
  still tests it without WebGL.
- **framed-map-and-hexes** — set `maxBounds` (and an initial `fitBounds`) to the theater bbox
  (already available from the theater API) so the map sits framed; add a viewport frame/border.
  Retune the hex layers (`overlays.ts` + `MapView.tsx` `tiles-fill`/`tiles-outline`) so hexes read
  crisp and non-overlapping on the light base (outline weight/colour/opacity; confirm boundary ring
  geometry). Verify pan/zoom stays inside the frame.
- **mgrs-grid-layout** — a **grid-layout setting** (UI control) toggling **MGRS (default)** vs
  **hex**. MGRS layout: generate grid lines for the chosen drawn precision (100 km/10 km/1 km/100 m)
  across the theater (zone 32U) using a bundled `mgrs` lib for lat/lon↔MGRS; draw the grid + MGRS
  square labels via a **self-hosted glyph** symbol layer (bundle a font PBF; declutter labels with
  collision/allow-overlap off). Selecting MGRS **hides** the hex layers; selecting hex restores them.
  Add a **precision selector**. Wire the **coordinate readout** (hover/click + tile panel) to show a
  full MGRS string to **1 m**. Click still resolves the underlying H3 tile for data. Persist the
  chosen layout + precision (e.g. `localStorage`). Keep MGRS math in a pure, unit-tested module
  (lat/lon→MGRS, square→corner-coords, bbox→grid-lines) — testable without the map canvas.
- **accent-and-selection-restyle** — change `--accent` (`index.css`) cyan→**#FFD9BD** and the 3
  hardcoded `#00e5cc` literals in `MapView.tsx` (active-routes line, route line, destination point).
  Add a **selected-unit** highlight (a second symbol/circle layer filtered by `selectedUnitId`) in a
  **darker blue** so the selected unit is visually distinct on the map (none exists today).

## Open Research
- **MGRS grid-line generation** — building grid lines + square labels for each drawn precision
  within the theater bbox in zone 32U: confirm Hohenfels (~11.8–11.9°E, 49.1–49.3°N) sits wholly in
  **32U** (no 32/33 zone-boundary handling needed); pick the line/label generation approach
  (`mgrs` round-tripping corners vs UTM easting/northing stepping). Confirm `mgrs` (or alternative)
  bundles cleanly for **offline** use.
- **Offline glyph source** — which font PBF to self-host for the MGRS label symbol layer (e.g. a
  Noto/Open-Sans fontstack in `public/`), and wiring MapLibre `glyphs:` to it without breaking the
  offline basemap. (This is the same constraint that disabled basemap text.)
- **Label density / decluttering** — at finer drawn precisions (100 m) many labels appear; decide
  zoom-dependent label visibility / collision so the grid stays readable.
- **"Non-overlapping hexes"** — confirm what currently reads as overlap (Wave-1 analysis found no
  technical overlap); likely the dark base + threat opacity. Verify on the light base and tune.
- **Default precision UX** — confirm 1 km default feels right live; consider auto-stepping drawn
  precision with zoom (coarser when zoomed out) as a possible enhancement.
- **Setting persistence & defaults** — where the grid-layout + precision setting lives (a map control
  vs a settings panel) and whether it persists across reloads.
