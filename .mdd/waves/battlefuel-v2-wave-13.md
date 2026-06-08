---
id: battlefuel-v2-wave-13
title: "Wave 13: Rendezvous fuel run — scheduled refuel at a sector"
initiative: battlefuel-v2
initiative_version: 8
status: planned
depends_on: battlefuel-v2-wave-12
demo_state: "In OF-8 the operator selects a fuel truck and clicks 'Plan rendezvous'. The flow then asks for a target unit (click it on the map) and a meeting sector (click the MGRS sector). The engine computes Safe + Fast routes for BOTH movers — the truck to the sector AND the unit to the sector. The operator then chooses 'Order now' (both movers dispatch immediately and fuel transfers when they meet at the sector) OR 'Plan rendezvous' → enter a sim-clock date/time → 'Send order', which files the rendezvous in the order archive as PLANNED with that time. When the sim clock reaches the planned time a reminder pops up and the operator confirms-to-launch (no silent auto-dispatch). Clicking any rendezvous order in the archive draws BOTH units' routes on the map. Reuses Wave-12 routed-refuel + co-location transfer and the Wave-10 Safe/Fast routing."
created: 2026-06-08
hash: b94c81a9
---

# Wave 13: Rendezvous fuel run — scheduled refuel at a sector

> **Immediate follow-on to Wave 12 (requester, 2026-06-08).** Wave 12 made refuel a one-sided
> routed run (one mover drives to a fixed point). Wave 13 turns it into a **two-sided
> rendezvous**: the operator picks a meeting **sector**, the engine routes **both** the tanker
> and the target unit to it, and the run can be **scheduled** against the sim clock — landing in
> the order archive as *planned* with a confirm-to-launch reminder when its time arrives.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000` (needs approval first)

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | rendezvous-routing | — | planned | — |
| 2 | scheduled-rendezvous-orders | — | planned | rendezvous-routing |
| 3 | plan-rendezvous-ui | — | planned | rendezvous-routing |
| 4 | rendezvous-archive-and-reminder-ui | — | planned | scheduled-rendezvous-orders, plan-rendezvous-ui |

Build order: 1 → 2 → 3 → 4 (backend rendezvous foundation → scheduling/persistence →
plan-flow UI → archive + reminder UI).

### Feature notes (requester 2026-06-08)
- **F1 rendezvous-routing** — backend foundation. A *rendezvous fuel run* = a meeting at an MGRS
  **sector** rather than at one party's position. Given a tanker, a target unit, and a sector
  (centre point), plan Safe + Fast routes for **both** movers to the sector, then on "order now"
  create **two move orders** (truck → sector, unit → sector) plus a refuel order that fires via
  the existing **co-location transfer** when they meet at the sector. Reuse Wave-10 `/routes/plan`
  (Safe/Fast) and Wave-12 `create_move_order` / `try_complete_refuel`. New: a `rendezvous` plan
  endpoint that returns both movers' route options, and a create path that dispatches the pair +
  the refuel order together (immediate / "order now").
- **F2 scheduled-rendezvous-orders** — backend scheduling + persistence. A rendezvous can be
  **planned** at a **sim-clock** date/time instead of dispatched now: persist it in the order
  archive as `planned` with the scheduled sim-time and both movers' planned routes. When the sim
  clock reaches the time, **emit a reminder** (chatter/event + a flag the UI surfaces) — **do NOT
  silently auto-dispatch**. A separate **confirm-launch** endpoint dispatches the two move orders +
  refuel order at that point (reuse F1's create path). Extends the order/archive model (a planned
  fuel-run record carrying truck_id, unit_id, sector, metric, scheduled_sim_time, both route
  geometries, status planned→launched).
- **F3 plan-rendezvous-ui** — frontend plan flow. A **"Plan rendezvous"** action on a selected
  fuel truck (alongside the existing "Create fuel run"): click → **pick the unit** (map click) →
  **pick the sector** (map click) → the panel shows **both** movers' Safe/Fast route options
  (dual preview on the map). Then two buttons: **"Order now"** (calls F1 immediate create) and
  **"Plan rendezvous"** → a **sim-clock date/time** input → **"Send order"** (calls F2 to file it
  as planned). Esc exits the mode. Reuse the Wave-12 `useFuelRun` route-preview plumbing.
- **F4 rendezvous-archive-and-reminder-ui** — frontend archive + reminder. Planned rendezvous
  runs appear in the **order archive / Order History** (Wave-11) with their scheduled sim-time and
  `planned` status. When the sim clock reaches a planned time, a **reminder popup** prompts the
  operator to **confirm-and-launch** (calls F2's confirm-launch) or dismiss/defer. **Clicking a
  rendezvous order** (planned or launched) **draws both units' routes** on the map.

## Open Research (resolved at plan-time, requester 2026-06-08)
- **Scheduling trigger** → at the planned sim-time, **pop a reminder requiring manual
  confirmation** to launch the refuel; never silent auto-dispatch (decided).
- **Time basis** → **sim-clock time**, scheduled against the continuous live sim clock (decided).
- **Approach** → new Wave 13 on its own branch off the Wave-12 tip (decided).
- **Rendezvous mechanic** → both the tanker AND the unit route to the chosen sector and meet
  there; the existing co-location transfer fires on meeting (decided).

### To resolve during planning (per feature)
- **Sector → meeting point**: which exact coordinate the two movers route to (MGRS cell centre at
  the current grid precision) and how arrival/meeting is detected when they reach it at different
  times (does the first arrival wait?).
- **Archive model**: extend the Wave-11 Order History store vs. a dedicated rendezvous record.
- **Reminder surfacing**: chatter line + popup vs. a dedicated reminder queue; dismiss/snooze.
