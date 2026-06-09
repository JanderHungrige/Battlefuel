---
id: 88-rendezvous-archive-and-reminder-ui
title: Rendezvous Archive + Reminder UI — order list, due popup, click-to-draw
edition: MDD
depends_on: [86-scheduled-rendezvous-orders, 87-plan-rendezvous-ui, 69-order-history-panel]
relates: [14-sim-engine]
source_files:
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/hooks/useRendezvousArchive.ts
  - frontend/src/components/RendezvousReminderBanner.tsx
  - frontend/src/components/OrderHistoryPanel.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/hooks/simSocket.test.ts
  - frontend/src/components/OrderHistoryPanel.test.tsx
  - frontend/src/hooks/useRendezvousArchive.test.ts
data_flow: greenfield
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [rendezvous, order-archive, reminder, websocket, maplibre, of-8]
path: Supply/Rendezvous
integration_contracts: []
satisfies_contracts:
  - from: 86-scheduled-rendezvous-orders
    function: "GET /rendezvous + GET /rendezvous/{id} + rendezvous_reminder WS frame + POST /rendezvous/{id}/confirm-launch + cancel"
    when: "operator views the archive, gets the due popup, confirm-launches or cancels, and clicks an order to draw both routes"
    status: done
    verified_at: "frontend/src/hooks/useRendezvousArchive.ts (listRendezvous/confirmLaunch/cancel); frontend/src/hooks/simSocket.ts:131 + useSimSocket.ts (rendezvous_reminder)"
known_issues: []
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 88 — Rendezvous Archive + Reminder UI

## Purpose

The OF-8 archive + reminder surface for scheduled rendezvous runs (F2). Planned rendezvous runs
appear in the Order History panel with their status (planned/due/launched/cancelled) and live
countdown. When a scheduled run comes due the sim broadcasts a `rendezvous_reminder` frame and a
**reminder banner** prompts the operator to **Confirm & launch** (F2 confirm-launch) or dismiss.
**Clicking** a rendezvous order draws **both** units' planned routes on the map.

## Architecture

- **WS frame** — `simSocket.parseRendezvousReminder` (pure) + a handler in `useSimSocket` that
  bumps `supplyTick` (so the archive refetches), pushes a strategic chatter line, and stores the
  latest `rendezvousReminder` for the banner. Mirrors the `buy_order_update`/`refuel_order_update`
  handling.
- **`useRendezvousArchive` hook** — fetches `GET /rendezvous` (enabled in OF-8, refetched on
  `supplyTick`); tracks the selected order; exposes `previewRoutes` built from the selected order's
  `truck_geometry` + `unit_geometry` (both drawn bold); `confirmLaunch(id)` + `cancel(id)`.
- **`RendezvousReminderBanner`** — mirrors `HaltBanner`: "Rendezvous due — tanker ↔ unit at
  sector" + **Confirm & launch** / **Dismiss**.
- **`OrderHistoryPanel`** — gains a "Rendezvous runs" section: each row shows tanker ↔ unit, a
  status badge, the chosen metric, and (for planned) the countdown; rows are clickable (draw both
  routes) and planned/due rows offer Cancel.
- **Map** — reuses the F3 `rendezvous-routes` layer. App feeds it the planning preview while a
  plan flow is active, otherwise the selected archived order's two geometries (no contention —
  the flows are mutually exclusive).

## Data Flow

Greenfield UI over F2 endpoints + the `rendezvous_reminder` WS frame. The countdown shown is the
order's `remaining_game_s` (decremented server-side); the archive refetches on each reminder.

## Business Rules

- The reminder requires explicit confirmation to launch — dismiss just hides the banner (the order
  stays `due` in the archive and can still be launched from there).
- Confirm-launch / cancel are only offered for non-terminal orders (planned/due).
- Selecting an order draws both routes; clearing selection (or starting a plan) removes them.

## Dependencies

- **86-scheduled-rendezvous-orders** — the archive endpoints, the reminder frame, confirm-launch/cancel.
- **87-plan-rendezvous-ui** — the `rendezvous-routes` map layer + preview-route shape reused here.
- **69-order-history-panel** — the panel this extends.

## Security

Frontend only; no secrets. Launch re-plans server-side (client geometry not trusted).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
