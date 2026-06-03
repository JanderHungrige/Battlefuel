---
id: 49-located-event-model
title: Located Combat-Event Model
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-3
wave_status: active
depends_on: []
relates: [20-event-engine, 30-strategic-support-chatter, 47-mgrs-grid-layout]
source_files:
  - backend/app/domain/combat_event.py
  - backend/app/providers/combat_events.py
  - backend/app/config.py
  - backend/app/services/sim_runner.py
  - backend/app/api/ws.py
  - frontend/src/api/types.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
routes: []
models: []
test_files:
  - backend/tests/test_combat_events.py
  - frontend/src/hooks/simSocket.test.ts
data_flow: mixed
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [combat-events, threat, mgrs, websocket, sim-loop, provider-factory, precision]
path: Events/CombatEvents
integration_contracts:
  - function: combat_event WS frame
    consumers: [50-threat-mgrs-squares, 51-event-hover-icons, 52-chatter-mgrs-tagging]
    contract: "A combat_event frame carries {id, category, event, lat, lon, precision_m, estimated_threat, sender, zone, game_s}. Downstream features render from precision_m + zone + estimated_threat. Wave 4 may ADD fields (catalog event_id, supply_relevant) but must not remove or repurpose these."
satisfies_contracts: []
known_issues: []
---

# 49 — Located Combat-Event Model

## Purpose

Introduce the first **located, categorised, precision-tagged combat event** in BattleFuel. Today
threat is per-H3-tile (`tile_update`) and chatter carries a location *or* a category but never both
with a precision. This feature adds a `CombatEvent` (category + lat/lon + `precision_m` +
`estimated_threat` + `sender` + `zone`), a `combat_event` WebSocket frame, a seeded demo emitter on
the sim clock, and the central **category → precision/zone** lookup. It is the foundation the rest
of Wave 3 renders from (threat squares, hover icons, MGRS-tagged chatter).

## Architecture

Mirrors the established **feed-provider** pattern (`tile_feed.py`, `strategic_feed.py`):

```
domain/combat_event.py        EventZone, CombatEvent (frozen), classify(), combat_event_frame()
providers/combat_events.py    due_combat_events(), CombatEventFeedProvider (ABC),
                              Scripted/None providers, registry + build_combat_event_feed_provider()
config.py                     combat_event_feed_provider: "scripted" | "none"
services/sim_runner.py        SimEngine.apply_combat_feed() — broadcasts due frames each tick
frontend simSocket.ts         parseCombatEvent() / applyCombatEvent() (pure, latest-per-id)
frontend useSimSocket.ts      combatEvents: Record<string, CombatEvent> in SimSocketState
```

The emitter is **clock-driven and deterministic** (events fire once when game-time first passes
`at_game_s`, exactly like the tile/strategic feeds), so it is demoable without a live data source
and swappable to a real source later via the factory. Combat events do **not** mutate tiles — they
are an independent located-threat layer alongside the H3 data layer.

## Data Model

`CombatEvent` (frozen dataclass, `app/domain/combat_event.py`) — a scheduled/source event:

| Field | Type | Notes |
|-------|------|-------|
| `id` | `str` | Stable id; frontend reduces latest-per-id |
| `at_game_s` | `float` | Game-seconds from sim start when it fires |
| `category` | `str` | CSV catalog category (e.g. "Threat Events") |
| `event` | `str` | CSV event headline (e.g. "IED / mine detected or detonated") |
| `lat` / `lon` | `float` | Theater coordinates (Hohenfels, zone 32U) |
| `estimated_threat` | `int` | 0–5, the CSV "Threat Level" |
| `sender` | `str` | Fake unit signature (call-sign + unit), e.g. "RECON 2-7 (1-4 CAV)" |
| `precision_m` | `int \| None` | Optional override; when `None`, derived via `classify()` |

`EventZone(str, Enum)`: `COMBAT` ("combat") · `BLOCKED` ("blocked") · `THREAT` ("threat"). Drives
the F2 colour rule (combat→red, blocked→light-yellow, threat→graded by estimated_threat).

No database tables — this is an in-memory feed (DB persistence deferred to Wave 4 catalog load).

## Business Rules

**`classify(category, event, estimated_threat) -> (precision_m, EventZone)`** — the central lookup,
rules in priority order (first match wins):

1. event contains `ied` / `mine` (incl. "minefield") → **(100, BLOCKED)** — impassable, finest grid
2. event contains `chokepoint` / `ford` / `loc (` / `severed` → **(1000, BLOCKED)** — denied corridor
3. `estimated_threat >= 5` OR event contains `route classified red` / `under fire` / `ambush` /
   `vbied` / `suicide` / `air strike` / `engagement` / `troops in contact` → **(1000, COMBAT)** — red
4. event contains `air threat` / `drone` / `fixed-wing` / `helo` → **(2000, THREAT)**
5. event contains `hostile unit spotted` / `identified` → **(2000, THREAT)** (the "1–2 km" case)
6. category fallback precision (`Threat Events`→1500, `Movement & Access`→1000, `Engagements & Fires`
   →1000, `Adversary Activity`/`Intelligence & Information`→2000, else 1000) → **THREAT**

A non-`None` `precision_m` on the event **overrides** the table's precision; the zone always comes
from the table (it is a semantic classification, not a size).

`precision_m` is the **square side in metres** (the event's location ± `precision_m`/2 in UTM zone
32U), not necessarily snapped to the MGRS lattice — "per-event precision" per the wave decision.

## API Endpoints

None. Transport is the existing WebSocket (`/ws`). New frame:

```json
{
  "type": "combat_event",
  "id": "ied-msr-7",
  "category": "Threat Events",
  "event": "IED / mine detected or detonated",
  "lat": 49.215, "lon": 11.835,
  "precision_m": 100,
  "estimated_threat": 4,
  "sender": "EOD 4-1 (52nd EOD)",
  "zone": "blocked",
  "game_s": 20.0
}
```

`combat_event_frame(ev, now_s)` builds this dict (runs `classify()`, applies any override).

## Data Flow

- **Origin:** `ScriptedCombatEventFeedProvider.events()` — a seeded Hohenfels schedule covering all
  three zones (IED→blocked/100 m, RED route→combat/1 km, hostile/air→threat/2 km, chokepoint→
  blocked/1 km, air strike→combat/1 km).
- **Emit:** `SimEngine.apply_combat_feed()` runs each tick after `apply_strategic_feed`, broadcasting
  `combat_event_frame()` for every event due in `(prev_s, now_s]` (live arrivals).
- **Snapshot on connect:** combat events are a **persistent threat laydown**, so `ws_endpoint` sends
  the full set (`send_combat_snapshot`) to each newly-connected client — without it, a client that
  connects after the timed feed has fired (e.g. a browser reload mid-sim) would see no squares. The
  frontend dedups chatter by event id so the snapshot + live broadcast never double a radio line.
- **Transport:** `ConnectionManager.broadcast(dict)` → `/ws` (live); per-socket send on connect (snapshot).
- **Consume:** `parseCombatEvent()` validates `type==='combat_event'` + string `id` + numeric `lat`;
  `applyCombatEvent()` keeps the latest frame per `id`; `useSimSocket` exposes `combatEvents`.
  Malformed frames are dropped with a logged warning (existing WS rule) — the socket is never torn
  down on one bad frame.

## Dependencies

None on other feature docs. Consumes the existing sim loop + WS broadcast + `mgrs`/grid theater
(zone 32U from `47-mgrs-grid-layout`). Produces the `combat_event` contract consumed by docs 50/51/52.

## Security

Not security-sensitive: no user input, no DB writes, no external calls. The emitter is a closed,
seeded schedule.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
