---
id: battlefuel-v2-wave-3
title: "Wave 3: MGRS-native Threat & Symbology"
initiative: battlefuel-v2
initiative_version: 2
status: planned
depends_on: battlefuel-v2-wave-2
demo_state: "Threat is drawn as MGRS squares at a per-event precision (IED/mine → 100 m, enemy-spotted → 1–2 km) from located + categorised combat events; red is reserved for combat zones and blocked areas read light-yellow, with category hover icons (drone / checkpoint / enemy-near). Chatter messages are tagged with their MGRS coordinate + sender and click-to-locate the square. Enemy units render as red NATO (APP-6 hostile) symbols from a seeded stub, and OF-8 depots show the correct NATO sustainment symbol with 4 diesel / 4 JP8 colour-coded fuel-fill bars."
created: 2026-06-03
hash: 7943477b
---

# Wave 3: MGRS-native Threat & Symbology

## Done-When (close-out gate)
Per the initiative's Wave Definition of Done, this wave is **NOT complete after a localhost
demo**. Mark `complete` only after all three gates pass (merging to `main`/prod needs explicit
approval first):

- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000` → then close the wave

> Frontend prod-build caveat (from Wave 2): smoke-test the **minified** build (`vite preview` +
> headless Chrome), not just `make dev` — dev is unminified and mocks `MapView`.

## Demo-State
Threat is no longer a flat hex wash: it is drawn as **MGRS squares at a per-event precision**
(IED / mine → 100 m, enemy-spotted → 1–2 km) from **located + categorised combat events**.
**Red is reserved for combat zones**, **blocked areas read light-yellow**, and each event square
carries a **category hover icon** (drone / checkpoint / enemy-near …). **Chatter messages are
tagged with their MGRS coordinate + sender** and click-to-locate the square on the map. **Enemy
units render as red NATO (APP-6 hostile) symbols** from a seeded stub, and **OF-8 depots show the
correct NATO sustainment symbol** with **4 diesel / 4 JP8 colour-coded fuel-fill bars**.

*(Not complete until demonstrated live — see Done-When gate above.)*

## Scope

A **thin backend slice + the symbology frontend** it unlocks. This wave introduces the first
*located, categorised, precision-tagged* combat-event model and renders everything that flows
from it. It deliberately does **not** do the full event/chatter overhaul (CSV catalog load,
arrival-rate config, click-to-expand detail, supply→advisor) — that is **Wave 4**. The contract
introduced here is designed so Wave 4 **extends** it rather than rewriting it.

**Locked inputs / resolved decisions (2026-06-03):**

- **Minimal event slice (backend).** Add a located + categorised + precision combat-event model
  (`CombatEvent`: `category`, `lat`/`lon`, `precision_m`, `estimated_threat`, `sender`) and a
  `combat_event` WebSocket frame, fed by a **small seeded / demo emitter**. The full
  `data/combat_zone_events.csv` (122 rows) load, configurable arrival rate, and click-to-expand
  detail stay in **Wave 4**. Design the frame field set now so Wave 4 only adds fields.
- **Threat → MGRS squares.** Render each event as an MGRS square at its precision, **reusing the
  Wave-2 `mgrsGrid.ts` pure module** (add a `squareCornersFromCenter(lat, lon, precisionM)` helper
  if not already derivable from the existing UTM stepping). Square opacity/shade scales with
  `estimated_threat`.
- **Colour semantics.** **Red reserved for combat zones** (highest-threat / active-combat events);
  **blocked / restricted areas → light-yellow**; ordinary threat squares shade by estimated threat.
  Reconcile with the existing hex `tiles-threat` red (`#ff3030`) and the Wave-2 accent `#FFD9BD`.
- **Category → precision table** (with an optional per-event `precision_m` override). One central
  lookup maps CSV category / event-type → drawn grid size (e.g. Threat Events: IED/mine → 100 m;
  "Hostile unit spotted" → 1–2 km; Movement RED route → 1 km). Events may override.
- **Category hover icons.** drone / checkpoint / enemy-near … glyphs shown on / near the squares,
  loaded as offline MapLibre images (decide milsymbol modifiers vs a small self-hosted SVG sprite).
- **Enemy units = seeded stub.** Persistent enemy units rendered as **red NATO (APP-6 hostile
  identity)** symbols, produced through the **factory/provider** so the data source stays swappable.
  Chatter-driven spawn is **Wave 4**; scenario placement is **Wave 7**.
- **Depot NATO symbol + fuel bars.** Replace the amber depot circle with the **correct APP-6
  sustainment/petroleum SIDC**, plus **per-fuel 4-segment fill gauges** (diesel + JP8), segments
  filled by `quantity_liters / capacity_liters` from the existing `FuelStock` model, colour-coded
  per fuel. No schema change to depots/stocks.
- **Chatter MGRS tagging.** Extend `ChatterMessage` with an MGRS coordinate string + `sender`;
  clicking a tagged message locates/highlights its MGRS square. Drop malformed frames with a logged
  warning (existing WS rule), never tear down the socket.

**Out of scope (later waves):**
- Full event/chatter overhaul — CSV catalog load, arrival-rate, click-to-expand detail, supply →
  advisor → order, obstacle dropdown → **Wave 4**.
- Tile click panels, intel button, request-data flow → **Wave 5**.
- Routing/movement UX (multiple routes, manual waypoints, on/off-road toggle) → **Wave 6**.
- Scenario builder (placing enemy units interactively) → **Wave 7**.
- 3D / DEM elevation → **Advanced**.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | located-event-model        | docs/49-located-event-model.md | active | — |
| 2 | threat-mgrs-squares        | — | planned | located-event-model |
| 3 | event-hover-icons          | — | planned | threat-mgrs-squares |
| 4 | chatter-mgrs-tagging       | — | planned | located-event-model |
| 5 | enemy-red-nato-units       | — | planned | — |
| 6 | depot-nato-symbol-fuelbars | — | planned | — |

**Build order:** 1 → 2 → 3, with 4 after 1; 5 and 6 are independent and can be built in parallel
with the threat chain.

### Feature notes
- **located-event-model** (backend) — new `CombatEvent` domain model (`category`, `lat`, `lon`,
  `precision_m`, `estimated_threat`, `sender`) behind the factory/provider; a `combat_event` WS
  frame; a small **seeded / demo emitter** (reuse the `event_engine` / `strategic_feed` timed
  pattern, but emit *located + categorised* events, not bare tile mutations). Frontend: add a
  pure `parseCombatEvent` / `applyCombatEvent` to `simSocket.ts` (latest-per-id reduce). Keep the
  frame forward-compatible with Wave 4's CSV catalog. Add the **category → precision** lookup table.
- **threat-mgrs-squares** (frontend) — new MapLibre source/layer drawing each combat event as an
  MGRS square at its `precision_m`, using `mgrsGrid.ts` (+ a `squareCornersFromCenter` helper).
  Shade by `estimated_threat`; red for combat zones, light-yellow for blocked. Pure square-geometry
  in a unit-tested module (no canvas).
- **event-hover-icons** (frontend) — category → glyph mapping; render drone/checkpoint/enemy-near
  icons as offline MapLibre images on/near the squares; hover shows the category + estimated threat.
- **chatter-mgrs-tagging** (frontend + backend) — extend `ChatterMessage` (MGRS string + `sender`);
  backend populates them on combat-event-derived chatter; `ChatterLog.tsx` shows the MGRS tag +
  sender and click-to-locate highlights the square (extend the existing h3-index click-locate).
- **enemy-red-nato-units** (frontend + backend) — seed a small set of **enemy units** through the
  provider with **hostile APP-6 SIDCs**; reuse `symbols.ts` / `sidcToImage()` so red symbols render
  via the existing icon pipeline; a distinct enemy layer (or affiliation-driven styling).
- **depot-nato-symbol-fuelbars** (frontend) — replace the `depots` circle layer with the correct
  NATO sustainment SIDC icon; render **4-segment diesel + 4-segment JP8 fill gauges** from
  `DepotFuel` stocks (quantity/capacity %), colour-coded per fuel. Decide bar rendering (DOM marker
  overlay vs canvas-composited icon) for crispness over MapLibre.

## Open Research
- **Category → precision mapping** — define the concrete lookup from `combat_zone_events.csv`'s 10
  categories / event names to drawn grid sizes (100 m / 500 m / 1 km / 2 km …). Which events are
  "combat zone" (red) vs "blocked" (light-yellow) vs graded threat? This table is the heart of the
  wave — get it right once.
- **combat_event WS frame contract** — fix the field set so Wave 4's full CSV/arrival-rate overhaul
  *adds* fields (e.g. `event_id` from catalog, `supply_relevant`) without breaking Wave 3 parsers.
- **MGRS square from a centre point** — confirm whether `mgrsGrid.ts` already yields a single
  square's corners at precision P, or add `squareCornersFromCenter(lat, lon, precisionM)` via the
  existing UTM (zone 32U) easting/northing stepping.
- **Offline hover-icon source** — milsymbol modifiers vs a self-hosted SVG/PNG sprite for
  drone/checkpoint/enemy-near; how to register them as MapLibre images without breaking offline use
  (same constraint that disabled basemap glyphs in Wave 2).
- **Red enemy SIDC** — derive a hostile APP-6 SIDC (standard-identity = hostile) by flipping the
  affiliation digit on existing friendly unit types vs authoring new enemy unit types in the seed.
- **Depot NATO symbol** — the correct APP-6 SIDC for a fuel/petroleum/sustainment depot, and the
  cleanest way to overlay 8 fuel-fill segments on a MapLibre symbol (marker DOM vs composited icon).
- **Threat colour reconciliation** — how MGRS threat squares coexist with the existing red hex
  `tiles-threat` wash and the Wave-2 `#FFD9BD` accent; whether the hex threat layer is suppressed
  when MGRS-square events are shown.
