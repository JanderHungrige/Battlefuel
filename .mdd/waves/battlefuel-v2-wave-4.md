---
id: battlefuel-v2-wave-4
title: "Wave 4: Event & Chatter Overhaul"
initiative: battlefuel-v2
initiative_version: 10
status: planned
depends_on: battlefuel-v2-wave-3
demo_state: "Events and radio chatter are driven by the full combat_zone_events.csv catalog: the sim emits located messages as 'MGRS location - headline' at a configurable tempo (default no faster than one every 15 seconds), operators can expand any chatter line for full detail (heading, sector, estimated threat, sender, supply relevance), filter/highlight threat vs supply events with adjustable thresholds, turn supply-relevant events into advisor-backed order proposals, spawn/update enemy sightings from relevant chatter, and use the same searchable event catalog when placing obstacles."
created: 2026-06-15
---

# Wave 4: Event & Chatter Overhaul

## Demo-State
Events and radio chatter are driven by the full `data/combat_zone_events.csv` catalog instead of
the small scripted demo list. During a live sim run, new messages arrive as **"MGRS location -
headline"** at a configurable tempo, defaulting to **no faster than one event every 15 real
seconds**. Clicking a chatter line expands it with **heading, sector/MGRS, estimated threat,
sender, category, supply relevance, and timestamp**. The operator can filter/highlight **threat**
and **supply-relevant** events, tune the displayed threat threshold, convert supply-relevant events
into an advisor-backed order proposal, and use the same event catalog through searchable controls
when placing obstacles or marking sector conditions.

*(Not complete until demonstrated live: local `make dev`, then `:3001`, then prod `:3000` per the
v2 wave Definition of Done.)*

> **Live-demo / deploy setup — `BATTLEFUEL_COMBAT_EVENT_FEED_PROVIDER`.** Selects the chatter
> feed: `scripted` (6 demo events) vs `catalog` (full `backend/data/combat_zone_events.csv`).
> - **Code default = `scripted`** (`config.py`) so backend tests stay deterministic.
> - **Dev/prod (:3001/:3000) = automatic `catalog`.** `deploy/compose.app.yml` defaults the
>   backend env var to `catalog`, and the CSV is baked into the backend image (`COPY data ./data`
>   → `/app/data/combat_zone_events.csv`). No host `.env` edit needed; to force the demo set on one
>   environment, set `BATTLEFUEL_COMBAT_EVENT_FEED_PROVIDER=scripted` in that `deploy/.env.*`.
> - **Local `make dev`** runs uvicorn directly (not via the prod compose), so it keeps the code
>   default `scripted`; for a local catalog demo:
>   `echo 'BATTLEFUEL_COMBAT_EVENT_FEED_PROVIDER=catalog' >> backend/.env`, then restart the backend.
> - F6 enemy sightings broadcast over WS regardless of this flag.

## Done-When (close-out gate)
Mark `complete` only after all three gates pass:
- [ ] **tested local** — `make dev`, CSV-driven event/chatter flow demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000`, after explicit approval

## ⚠ Post-build redesign — UNIFIED into Channel A (see docs/100-unified-threat-chatter.md)
The original build shipped the catalog chatter as a **separate** system (Channel B: combat-event
squares + a second chatter feed) alongside the original tile/event-engine threat (Channel A). Per
operator feedback this was merged: the **EventEngine now fires from the catalog**, stamps each tile
with its located event (`Tile.last_event`, migration 0017), drives **one** expandable
`"<MGRS> — <headline>"` chatter feed (filter kept, default ≥3), shows the detail in the MGRS-cell
panel + an optional cell-hover popup, and spawns/*removes* enemy units with the threat. Channel B
(the `combat_event` feed, squares, second feed) is **deleted**. The catalog feed is no longer an
opt-in flag — it is the default EventEngine source (`BATTLEFUEL_COMBAT_EVENT_FEED_PROVIDER` is gone).
F1 (catalog provider) and F7 (obstacle picker) are retained; F2/F3/F6 are subsumed by the unified
flow. On `feat/unify-threat-chatter`.

## Scope
Wave 3 created the forward-compatible `combat_event` contract, MGRS threat squares, hover icons,
and MGRS-tagged chatter from a small seeded event list. This wave turns that slice into the real
event/chatter system:

- Load `combat_zone_events.csv` through a swappable provider/factory, preserving the existing
  `combat_event` WebSocket contract and only adding fields.
- Replace the tiny scripted schedule with a configurable, deterministic event generator over the
  catalog and the Hohenfels theater.
- Make chatter a useful operator surface: compact message text, expandable detail, filters,
  threshold controls, and click-to-locate.
- Connect supply-relevant events to the existing advisor/order flow without auto-executing orders.
- Use event categories consistently across chatter, threat rendering, enemy sightings, and obstacle
  placement.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | combat-event-catalog-provider | docs/92-combat-event-catalog-provider.md | built (local) | 49-located-event-model |
| 2 | event-arrival-scheduler | docs/93-event-arrival-scheduler.md | built (local) | combat-event-catalog-provider |
| 3 | expandable-chatter-detail | docs/94-expandable-chatter-detail.md | built (local) | event-arrival-scheduler, 52-chatter-mgrs-tagging |
| 4 | chatter-filters-highlights | docs/95-chatter-filters-highlights.md | built (local) | expandable-chatter-detail, 50-threat-mgrs-squares |
| 5 | supply-event-advisor-actions | docs/96-supply-event-advisor-actions.md | built (local) | expandable-chatter-detail, 36-advisor-ui |
| 6 | chatter-driven-enemy-sightings | docs/97-chatter-driven-enemy-sightings.md | built (local) | event-arrival-scheduler, 53-enemy-red-nato-units |
| 7 | obstacle-event-catalog-picker | docs/98-obstacle-event-catalog-picker.md | built (local) | combat-event-catalog-provider, 22-obstacle-tile-ops-ui |

Build order: 1 -> 2 -> 3 -> 4, then 5/6/7 can proceed in parallel once the expanded event payload
is stable.

### Feature Notes
- **F1 combat-event-catalog-provider** — Add a typed CSV catalog loader for
  `data/combat_zone_events.csv` with fields `category`, `event`, `threat_level`, and
  `supply_relevant`. Keep it behind the existing provider/factory pattern: `csv_catalog` for the
  full data, `scripted` for the current demo fixture, and `none` for tests/CI. Extend
  `CombatEvent` and the `combat_event` frame with additive fields only: `catalog_id`,
  `supply_relevant`, optional `detail`, and any normalized category metadata. Preserve existing
  consumers of `{id, category, event, lat, lon, precision_m, estimated_threat, sender, zone,
  game_s}`.
- **F2 event-arrival-scheduler** — Generate located event instances from the catalog at a
  configurable arrival rate. Default: no faster than one every 15 real seconds at the current sim
  speed. Add settings such as `combat_event_provider`, `combat_event_mean_interval_game_s`,
  `combat_event_seed`, and a max burst guard. Scheduling must be deterministic with injected RNG
  and clock in tests. Location assignment should stay theater-bounded and weighted by scenario
  context when available: frontline/high-threat areas for combat, rear/logistic sites for supply,
  and existing enemy/supply objects where relevant.
- **F3 expandable-chatter-detail** — Render chatter messages as compact lines:
  **`<MGRS> - <headline>`**, with sender visible but secondary. A click expands in-place or opens a
  small detail panel showing heading/headline, MGRS/sector, event category, estimated threat,
  sender, supply relevance, sim timestamp, and any generated detail. Keep click-to-locate intact:
  selecting an event still highlights and eases to the MGRS square. The reducer remains pure and
  malformed frames are dropped with a logged warning.
- **F4 chatter-filters-highlights** — Add operator controls for filtering/highlighting event
  traffic: all/threat/supply, threat threshold slider, and toggles for red combat vs yellow blocked
  vs graded threat squares. The map highlight should use the same central event classification as
  Wave 3, not a second frontend-only interpretation. Keep controls compact so they do not crowd the
  existing map and panels.
- **F5 supply-event-advisor-actions** — For `supply_relevant` events, expose a clear action such as
  **Ask advisor** or **Create proposal**. It should call the existing advisor/order machinery and
  return an advisory recommendation; it must not auto-place orders. Suggested mappings:
  convoy/resupply events -> stock redistribution or order-fuel proposal, supply-route disruption ->
  route/reposition warning, depot/supply shortfall -> refuel/redistribution proposal. Chatter gets
  an order/proposal status line when the operator applies a recommendation.
- **F6 chatter-driven-enemy-sightings** — Events that mean "enemy spotted/identified/contact" spawn
  or update a hostile enemy unit through the existing enemy-unit provider seam. The map keeps using
  red APP-6 hostile symbols from Wave 3. Deduplicate sightings by event id or generated contact id,
  and update location/threat rather than creating endless duplicates from repeated catalog events.
- **F7 obstacle-event-catalog-picker** — Replace hard-coded obstacle wording with a searchable
  catalog/category picker in obstacle mode. Operator can search categories/events, choose a relevant
  template, then place the obstacle/sector condition on the map. The selected catalog item should
  prefill sensible obstacle kind, situation, note, threat, and road/intel defaults while still
  allowing manual override.

## API & Data Contracts
- Existing WebSocket frame remains `type: "combat_event"`.
- Existing required fields remain stable: `id`, `category`, `event`, `lat`, `lon`, `precision_m`,
  `estimated_threat`, `sender`, `zone`, `game_s`.
- Additive fields planned: `catalog_id`, `supply_relevant`, `detail`, `heading`, `location_label`,
  and possibly `contact_id` for enemy sightings.
- Chatter entries should remain `ChatterMessage[]`, but can add optional fields such as
  `category`, `estimated_threat`, `supply_relevant`, `detail`, and `expanded`.
- No frontend code should parse CSV directly; CSV loading belongs behind backend providers.

## Verification
- Backend unit tests for CSV parsing, malformed rows, provider registry selection, deterministic
  event scheduling, arrival-rate bounds, additive `combat_event` frame fields, and enemy-contact
  deduplication.
- Frontend pure tests for parsing/reducing extended combat events, building chatter lines, dropping
  malformed frames, filtering by threat/supply, and preserving click-to-locate behavior.
- Component tests for `ChatterLog` expansion, filter controls, supply-event advisor action affordance,
  and obstacle catalog picker.
- Manual `make dev` demo: run sim, observe CSV-derived events, expand chatter detail, filter by
  threat/supply, click-to-locate an event, create an advisor proposal from a supply event, place an
  obstacle from catalog search, and confirm enemy sighting updates a red APP-6 hostile symbol.

## Open Research
- **Location generation:** choose the first implementation: scenario-weighted random coordinates,
  nearest known units/sites, or a small theater location library. Prefer deterministic and simple
  for Wave 4, but leave a provider seam for real feeds.
- **CSV enrichment:** decide whether to keep the current four-column CSV as canonical or add optional
  columns for sender pool, default precision, detail text, location bias, and enemy-contact mapping.
- **Arrival-rate units:** confirm whether "default <=1/15s" means real seconds regardless of sim
  time scale, or game seconds transformed by the sim clock. The demo-state currently assumes real
  seconds at current sim speed.
- **Advisor mapping:** define exactly which supply-relevant categories map to refuel, order-fuel,
  redistribution, or movement advice; keep unmapped events as informational.
- **UI density:** decide whether expanded detail lives inside `ChatterLog`, a side drawer, or the
  existing inspect/advisor panel area so it does not collide with OF-4/OF-8 workflows.
