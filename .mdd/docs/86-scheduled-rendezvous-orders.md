---
id: 86-scheduled-rendezvous-orders
title: Scheduled Rendezvous Orders — plan against the sim clock, remind, confirm-launch
edition: MDD
depends_on: [85-rendezvous-routing, 27-buy-orders, 14-sim-engine]
relates: [69-order-history-panel]
source_files:
  - backend/app/domain/rendezvous.py
  - backend/app/models/rendezvous.py
  - backend/app/providers/rendezvous.py
  - backend/app/services/rendezvous_schedule_service.py
  - backend/app/api/rendezvous.py
  - backend/app/services/sim_runner.py
  - backend/app/config.py
  - backend/alembic/versions/0016_rendezvous_orders.py
routes:
  - POST /api/v1/rendezvous/schedule
  - GET /api/v1/rendezvous
  - GET /api/v1/rendezvous/{order_id}
  - POST /api/v1/rendezvous/{order_id}/confirm-launch
  - POST /api/v1/rendezvous/{order_id}/cancel
models:
  - rendezvous_orders
test_files:
  - backend/tests/test_rendezvous_schedule.py
data_flow: .mdd/audits/flow-scheduled-rendezvous-orders-2026-06-09.md
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [rendezvous, scheduling, sim-clock, reminder, order-archive, fuel-run]
path: Supply/Rendezvous
integration_contracts:
  - function: "rendezvous_orders archive (list/get) + rendezvous_reminder WS frame + confirm-launch"
    when: "F4 rendezvous-archive-and-reminder-ui lists/draws orders, shows the reminder popup, and calls confirm-launch"
    consumers: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 86 — Scheduled Rendezvous Orders

## Purpose

Lets a rendezvous fuel run (F1) be **planned** for a future sim-clock time instead of dispatched
now: it is persisted in the order archive as `planned` with both movers' planned routes; when the
sim clock reaches the time a **reminder** fires (chatter + WebSocket frame) and the operator must
**confirm-to-launch** — there is no silent auto-dispatch. A separate confirm-launch endpoint then
dispatches the pair + refuel via F1's `start_rendezvous`.

## Architecture

Mirrors the **buy-order** scheduling pattern (the established restart-safe model):

- **Countdown, not absolute clock.** `SimEngine._game_s` resets to 0 on restart and is not
  persisted, so a planned rendezvous stores `remaining_game_s` (a countdown) decremented each
  tick — exactly like `buy_orders.remaining_game_s`. The operator schedules it
  `scheduled_game_s` game-seconds from now; F3 converts its date/time picker into that delay.
- **Reminder.** `SimEngine.check_rendezvous_reminders` (new, alongside `advance_buy_orders` in
  `_run`) decrements each `planned` order; when `remaining_game_s` hits 0 it broadcasts a
  `rendezvous_reminder` frame + a `strategic_message` and flips the order `planned → due`. The
  reminder fires exactly once (only `planned` orders are counted down).
- **Confirm-launch.** `POST /rendezvous/{id}/confirm-launch` reuses F1 `start_rendezvous`
  (re-plans + dispatches both movers + refuel server-side) and flips the order `→ launched`.

```
POST /rendezvous/schedule ─▶ plan_rendezvous (validate + routes + fuel-to-meet)
                             persist RendezvousOrder(status=planned, remaining=scheduled_game_s,
                                                     truck_geometry, unit_geometry)
sim tick ───────────────────▶ check_rendezvous_reminders: remaining -= dt
                             remaining<=0 → broadcast rendezvous_reminder + chatter, status→due
operator confirms ──────────▶ POST /rendezvous/{id}/confirm-launch → start_rendezvous, status→launched
```

## Data Model

New table `rendezvous_orders` (migration `0016`):

| Column | Type | Notes |
|--------|------|-------|
| id | str PK | uuid hex |
| truck_id | str | the tanker |
| unit_id | str | the unit being refuelled |
| sector_lat / sector_lon | float | sector cell centre |
| sector_h3 | str | sector cell id |
| metric | str | `fast` / `safe` (chosen at schedule time) |
| mode | str | RouteMode |
| scheduled_game_s | float ≥0 | original countdown (for display) |
| remaining_game_s | float ≥0 | countdown to the reminder; decremented each tick |
| truck_geometry | JSONB `[[lon,lat],…]` | planned route snapshot |
| unit_geometry | JSONB `[[lon,lat],…]` | planned route snapshot |
| truck_fuel_to_meet / unit_fuel_to_meet | float ≥0 | fuel-to-meet snapshot |
| status | str | `planned` → `due` → `launched`, or `cancelled` |
| created_at | datetime | server default |

`RendezvousOrderStatus`: `planned | due | launched | cancelled`.

## API Endpoints

All under `/api/v1`, no auth (single-user, server-authoritative).

- **`POST /rendezvous/schedule`** — `{ truck_id, unit_id, sector_lat, sector_lon, metric=safe,
  mode=road, scheduled_game_s }` → `RendezvousOrder` (status `planned`). 404 unknown truck/unit;
  422 unroutable / invalid refuel linkage.
- **`GET /rendezvous`** — list all rendezvous orders (archive, F4).
- **`GET /rendezvous/{order_id}`** — one order incl. both geometries (click-to-draw, F4). 404 if absent.
- **`POST /rendezvous/{order_id}/confirm-launch`** — dispatch via `start_rendezvous`; status
  `→ launched`. Returns `{ rendezvous_order, truck_move_order, unit_move_order, refuel_order }`.
  404 unknown order; 409 if already launched/cancelled; 422 if no longer routable.
- **`POST /rendezvous/{order_id}/cancel`** — status `→ cancelled` (only from `planned`/`due`).

## Business Rules

- **No silent auto-dispatch** — reaching the scheduled time only fires a reminder + flips to
  `due`; dispatch requires an explicit confirm-launch call.
- **Reminder fires once** — only `planned` orders are decremented; flipping to `due` stops it.
- **Launch is authoritative** — `start_rendezvous` re-plans server-side; the stored geometry is a
  display snapshot only (same trust posture as 13-move-orders).
- **Validation at schedule time** reuses F1 (truck = fuelled FUEL_SUPPLY of the unit's fuel type,
  `truck_id != unit_id`, both routable).
- A `launched`/`cancelled` order cannot be launched again (409).

## Data Flow

See `.mdd/audits/flow-scheduled-rendezvous-orders-2026-06-09.md`.

## Dependencies

- **85-rendezvous-routing** — `plan_rendezvous` (validate + capture routes/fuel-to-meet) and
  `start_rendezvous` (confirm-launch dispatch).
- **27-buy-orders** — the restart-safe countdown scheduling pattern (model/provider/sim-decrement).
- **14-sim-engine** — the tick loop + `ConnectionManager.broadcast` for the reminder frame.

## Security

Single-user, server-authoritative; no external/untrusted callers. Confirm-launch re-plans
server-side (client geometry not trusted). No new secrets, no new outbound network calls.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
