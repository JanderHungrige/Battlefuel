---
id: battlefuel-v2
title: BattleFuel v2 — Combat UX, Routing, Scenarios & Onboarding
status: planned
version: 1
hash: fc88db75
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

## Open Product Questions
*(Must be answered before the affected wave can be planned — `/mdd plan-wave`.)*

- [ ] **Off-road / "by foot" routing (Wave 6)** — today routing is pgRouting over the road
  graph (`ways`). Moving through terrain requires a *second* router over the H3/terrain grid
  with by-foot speeds + terrain cost. Confirm scope: full terrain router now, or a simpler
  "straight-line + terrain-cost" approximation first? This is the largest single item.
- [ ] **Classic map style (Wave 2)** — ship a light MapLibre style for the existing offline
  PMTiles (stays fully offline, no external tiles). Any specific look/reference, or "lighter +
  classic, no legend" is enough?
- [ ] **3D elevation (Advanced)** — needs an offline DEM (terrain-RGB tiles) for the Hohenfels
  theater. Do we source/package a DEM, or defer this item?
- [ ] **Landing page + login (Wave 8)** — provide the **Eraneos** and **World Fuel** logo
  assets + the pitch/pricing copy. How real is the "fun login": a demo gate (no real auth) or
  actual authentication? (App is currently single-user, no auth.)
- [ ] **Chatter "estimated threat (ours)" + "sender" (Wave 4)** — define how *our* estimated
  threat is derived per event, and what the set of "senders" is (HQ, recon, drone, sigint…).
- [ ] **Event catalog source (Wave 4)** — confirm `combat_zone_events.csv` (currently in repo
  root, 120 rows: Category, Event, Threat Level, Supply Relevant) is the seed catalog and may
  be moved into `data/` and loaded by the event/chatter engine.
- [ ] **Enemy units (Wave 3)** — where do enemy units + positions come from (seed list?
  scenario-defined? scripted feed?) and do they move, or are they static intel markers for now?

## Waves
| Wave | File | Demo-state | Status |
|------|------|------------|--------|
| Wave 1 | waves/battlefuel-v2-wave-1.md | The two known bugs are fixed: a unit reliably routes to a destination and traverses it (no "no route" / no back-and-forth / no stall); the unit "request data" action creates an order and flips status to "update requested: <ts>" with a re-request button. | planned |
| Wave 2 | waves/battlefuel-v2-wave-2.md | Map foundations: a lighter classic offline style (no legend), the whole map in a frame with non-overlapping hexes, sector coordinate labels (A1…), indicator accent recoloured cyan→#FFD9BD, selected unit shown in a darker blue. | planned |
| Wave 3 | waves/battlefuel-v2-wave-3.md | Threat & symbology: red reserved for combat zones, blocked areas light-yellow, hover icons for other indicators (drone/checkpoint/enemy-near…); enemy units rendered with red NATO symbols; OF-8 depots use the correct NATO symbol + 4 diesel/4 JP8 colour-coded fuel bars. | planned |
| Wave 4 | waves/battlefuel-v2-wave-4.md | Events/chatter overhaul: catalog from combat_zone_events.csv; messages as "location – headline"; configurable arrival rate (default ≤1/15s); click-to-expand detail (heading, sector, est. threat, sender); supply/threat highlight toggles (yellow/red/adjustable threshold); supply events → advisor → create order; obstacle mode uses the same list via dropdown+search. | planned |
| Wave 5 | waves/battlefuel-v2-wave-5.md | Tiles & panels: tile click shows last+highest threat, intel button (all tile messages), units-in-tile; tile panel persistent + updates on route-point click; Unit Overview tab (area, threat, fuel, orders) with click-to-locate; unit-overview and advisor panels no longer overlap; the request-data flow (manual entry + async values via chatter → apply). | planned |
| Wave 6 | waves/battlefuel-v2-wave-6.md | Routing/movement UX: Esc exits the current mode; smaller movement ticks; multiple routes (primary bold + lighter alternatives); manual route planning with fuel results; off-road/by-foot movement; precise free-waypoint vs move-to-area modes; remove manually-added obstacles; manually add fuel depots. | planned |
| Wave 7 | waves/battlefuel-v2-wave-7.md | Scenario builder: build and save a custom start setting — place units, set their attributes, and reload the saved scenario. | planned |
| Wave 8 | waves/battlefuel-v2-wave-8.md | Landing page (Eraneos + World Fuel branding, product pitch, fun login) plus a technical data-integration section explaining the DB/data model, expected columns/types, and how to add a new source (Excel connector / mapping table). | planned |
| Advanced | waves/battlefuel-v2-advanced.md | 3D terrain elevation on the map with an on/off switch (offline DEM). | planned |

> Item→wave traceability for every line of the original request is kept in
> `.mdd/docs/` once each wave is planned; this table is the index.
