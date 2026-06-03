---
id: battlefuel-v2
title: BattleFuel v2 — Combat UX, Routing, Scenarios & Onboarding
status: planned
version: 3
hash: 2b62f99e
created: 2026-06-02
---

# BattleFuel v2

## Overview

A second milestone of enhancements on top of the complete BattleFuel MVP (initiative
`battlefuel`, waves 1–7). It fixes two live bugs first, then reworks the operator experience:
a lighter/framed map with sector coordinates and richer threat symbology, enemy units, an
event/chatter overhaul driven by `combat_zone_events.csv`, tile & panel improvements, a much
richer routing/movement UX (off-road, multiple routes, manual planning, precise waypoints),
a scenario builder, and a public landing page with a data-integration guide.

**Sequencing rule (from the requester): start with the bugs.** Then optics/map foundations,
then the feature areas. Each wave is independently demoable.

## Resolved Decisions
*(All resolved 2026-06-02. These are locked inputs for wave planning.)*

- [x] **Off-road / "by foot" routing** → **build a FULL terrain router** over the H3/terrain
  grid (by-foot speeds + terrain cost), in addition to the road router. **Tackled together with
  the routing bug in Wave 1** (the engine work is shared). Remaining routing *UX* stays in Wave 6.
- [x] **Telemetry "request data" bug** → **not top priority**; folded into **Wave 5** with the
  request-data redesign (manual entry + request → async value via chatter → apply). Removed from
  Wave 1.
- [x] **Classic map style** → light MapLibre style over the existing offline PMTiles
  ("lighter + classic, no legend" is sufficient; no external reference).
- [x] **3D elevation (Advanced)** → **in scope**: source + package an **offline DEM** for the
  Hohenfels theater and add an **on/off toggle**.
- [x] **Landing page** → use the logos in **`company Logos/`** (`eraneos_Logo-and-BrandSign-black.png`,
  `World-Fuel-Services-Logo.png`) + pitch copy. **Login is deferred to `TODO.md`** (Wave 8 ships
  the landing page + data-integration guide, no auth yet).
- [x] **Enemy units** → **scenario-defined** with a **demo-script option**, and **wired to the
  chatter**: an "enemy spotted in sector X" event spawns/updates an enemy unit there. Rendered
  in Wave 3 (red NATO), spawned via Wave 4 (chatter) + Wave 7 (scenario).
- [x] **Chatter "estimated threat (ours)"** → the **Threat Level from the CSV** (expand the CSV
  if needed). **Senders** → HQ / recon / drone / SIGINT etc. **plus a fake unit signature**
  (e.g. call-sign + unit, as if we know the sending unit).
- [x] **Event catalog** → `data/combat_zone_events.csv` (moved here; 120 rows: Category, Event,
  Threat Level, Supply Relevant) is the seed catalog, loaded by the event/chatter engine.

## Branching workflow (per requester)
Per wave/feature: work on a **feature branch** → test locally with `make dev` → merge to
**`dev-deployment`** for online testing (auto-deploys to `:3001`) → once verified, merge to
**`main`** (prod `:3000`).

## Wave Definition of Done (per requester, 2026-06-03)
A wave is **NOT complete after a localhost demo**. Mark it `complete` only after all three gates
pass — track them as a checklist **in each wave doc** (not here — this is the template):

1. **tested local** — `make dev`, demoed on localhost
2. **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
3. **merged into main / deployed in prod** — on `main`, live `:3000` → then close the wave

(Merging to `main`/prod always needs explicit approval first.)

## Waves
| Wave | File | Demo-state | Status |
|------|------|------------|--------|
| Wave 1 | waves/battlefuel-v2-wave-1.md | Routing engine fixed + extended: a unit reliably routes to a destination and traverses it (no "no route" / no back-and-forth / no stall), AND a new full terrain (off-road / by-foot) router lets units move cross-country with terrain cost, not just on roads. | complete |
| Wave 2 | waves/battlefuel-v2-wave-2.md | Map foundations: a lighter classic offline style (no legend), the whole map framed in the viewport with crisp non-overlapping hexes, accent recoloured cyan→#FFD9BD, selected unit in a darker blue, and a selectable grid layout — MGRS grid (default, drawn 100km–100m / 1km default, readout to 1m) ↔ H3 hex grid. | complete |
| Wave 3 | waves/battlefuel-v2-wave-3.md | MGRS-native threat & symbology: **threat rendered as MGRS squares at a per-event precision** (event type → grid size, e.g. IED/mine→100 m, enemy spotted→1–2 km), driven by located+categorised events (CSV catalog categories), with **chatter messages tagged with their MGRS coordinate**; red reserved for combat zones, blocked areas light-yellow, hover icons (drone/checkpoint/enemy-near…); enemy units in red NATO symbols; OF-8 depots use the correct NATO symbol + 4 diesel/4 JP8 colour-coded fuel bars. (Needs a backend event-model change: events carry category + location + precision; coordinate with the Wave-4 chatter/CSV overhaul.) | complete |
| Wave 4 | waves/battlefuel-v2-wave-4.md | Events/chatter overhaul: catalog from combat_zone_events.csv; messages as "location – headline"; configurable arrival rate (default ≤1/15s); click-to-expand detail (heading, sector, est. threat, sender); supply/threat highlight toggles (yellow/red/adjustable threshold); supply events → advisor → create order; obstacle mode uses the same list via dropdown+search. | planned |
| Wave 5 | waves/battlefuel-v2-wave-5.md | Tiles & panels: tile click shows last+highest threat, intel button (all tile messages), units-in-tile; tile panel persistent + updates on route-point click; Unit Overview tab (area, threat, fuel, orders) with click-to-locate; unit-overview and advisor panels no longer overlap; the request-data flow rebuilt (fix the dead button → manual entry + request → async values via chatter → apply, status "update requested: <ts>" + re-request). | planned |
| Wave 6 | waves/battlefuel-v2-wave-6.md | Routing/movement UX (engine from Wave 1): Esc exits the current mode; smaller movement ticks; multiple routes (primary bold + lighter alternatives); manual route planning with fuel results; precise free-waypoint vs move-to-area modes; on/off road choice surfaced in the UI; remove manually-added obstacles; manually add fuel depots. | planned |
| Wave 7 | waves/battlefuel-v2-wave-7.md | Scenario builder: build and save a custom start setting — place units, set their attributes, and reload the saved scenario. | planned |
| Wave 8 | waves/battlefuel-v2-wave-8.md | Landing page (Eraneos + World Fuel branding from `company Logos/`, product pitch) plus a technical data-integration section explaining the DB/data model, expected columns/types, and how to add a new source (Excel connector / mapping table). Login deferred to TODO.md. | planned |
| Wave 9 | waves/battlefuel-v2-wave-9.md | MGRS-native inspection (retire the hex tile from the UX): clicking selects the MGRS cell at the current precision and the panel shows its MGRS coordinate + aggregated situation (highest/last threat, terrain mix, road, intel, units-in-cell), with no hex/H3 vocabulary in the UI; a read-only backend MGRS-cell aggregation endpoint begins the hybrid data migration (threat-first); terrain routing stays on H3 for the routing wave. | planned |
| Advanced | waves/battlefuel-v2-advanced.md | 3D terrain elevation on the map with an on/off switch (offline DEM). | planned |

> Item→wave traceability for every line of the original request is kept in
> `.mdd/docs/` once each wave is planned; this table is the index.

> **Build-order resequencing (2026-06-03, requester):** after Wave 3, build **Wave 9
> (hex→MGRS inspection)** next, then a **routing/movement overhaul** wave (to be planned —
> fixes unit-stall-on-blocked-tile; overlaps/absorbs Wave 6), then the original **W4–W8**.
> The wave *numbers* are creation ids, not build order — `Status` tracks what's done.