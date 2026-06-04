---
id: 63-routing-mode-multi-route-ui
title: Routing-Mode + Multi-Route UI (Halt Banner, Esc)
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-10
wave_status: active
depends_on: [60-never-stall-traversal-threat-crossing, 61-hybrid-direct-routing-modes, 15-move-planning-ui]
relates: [16-live-movement-ui, 21-threat-planning-ui]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/hooks/useMovePlanning.ts
  - frontend/src/components/MoveRoutesPanel.tsx
  - frontend/src/components/HaltBanner.tsx
  - frontend/src/lib/halt.ts
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/api/client.test.ts
  - frontend/src/lib/halt.test.ts
data_flow: reads-existing
last_synced: 2026-06-04
status: complete
phase: all
mdd_version: 11
tags: [frontend, routing, movement, ui, maplibre, halt]
path: Map/Movement
integration_contracts: []
satisfies_contracts:
  - from: 60-never-stall-traversal-threat-crossing
    function: "halt banner + Proceed-slowly/Re-route buttons + L5 crossing warning"
    when: "a unit halts (unit_update.status == 'halted') or a planned route has threat_max >= 5"
    status: done
    verified_at: "frontend/src/components/HaltBanner.tsx, frontend/src/App.tsx (proceedHalted→api.proceedMoveOrder), frontend/src/components/MoveRoutesPanel.tsx (THREAT_COMBAT warning)"
known_issues:
  - "Visual/interaction details (selector layout, banner placement, route bold-vs-light styling, Esc focus behaviour) are verified at the live `make dev` gate — the test env mocks MapView (no WebGL/WebSocket in jsdom)."
  - "Multiple-routes display: the panel lists fastest + safest cards (selected = highlighted). Showing several alternatives bolder/lighter on the map beyond the selected route is minimal; richer alternative-rendering can follow at the live gate."
---

# 63 — Routing-Mode + Multi-Route UI (Halt Banner, Esc)

## Purpose

Surfaces the Wave-10 engine in the operator UI: choose a travel mode (road/off-road/hybrid/direct),
see the threat warning when a route crosses a combat sector, act on a halted unit (proceed slowly
or re-route), and press Esc to leave any mode. The route always starts at the unit's symbol centre.

## Architecture

- **Travel-mode selector** (`MoveRoutesPanel`): four buttons (Road / Off-road / Hybrid / Direct)
  bound to `useMovePlanning.mode`. Changing the mode re-plans the current destination
  (`planFor(lat, lon, mode)` → `api.planRoute({..., mode})`); confirming sends the mode on
  `createMoveOrder`.
- **L5 warning** (`MoveRoutesPanel`): an option with `threat_max >= 5` shows a red "crosses COMBAT
  sector" warning (the requester's "over level 4"); `>= 3` keeps the amber sector warning.
- **Halt banner** (`HaltBanner` + `App`): `firstHaltedUnit(live)` (pure, in `lib/halt.ts`) finds a
  unit whose `unit_update.status === 'halted'`; the banner offers **Proceed slowly**
  (`api.proceedMoveOrder(orderId)` → order `crossing`) or **Re-route** (selects the unit and opens
  planning). Dismissible per order id.
- **Esc** (`App`): a window keydown handler exits obstacle mode and clears selection/planning.
- **Route start = unit symbol centre**: planning uses the unit instance's live position (where its
  symbol is drawn) as the origin, so this holds by construction.

## Business Rules

1. The mode selector re-plans immediately so the operator sees each mode's routes before confirming.
2. The chosen `mode` is sent on both `planRoute` and `createMoveOrder` (backend default `road`).
3. A halted unit always surfaces an actionable banner — never a silent stuck unit.
4. Esc is a global exit for the current interaction mode.

## Data Flow

`useMovePlanning.mode` → `api.planRoute({mode})` / `api.createMoveOrder({mode})` → backend F2 router
→ `RouteOption[]` (with `threat_max`) → panel cards + L5 warning. `unit_update.status='halted'`
(F1) → `firstHaltedUnit` → `HaltBanner` → `api.proceedMoveOrder` (F1 endpoint).

## Dependencies

- **60** — the halt model + `/proceed` endpoint this UI drives (contract satisfied here).
- **61** — the road/off-road/hybrid/direct modes the selector exposes.
- **15-move-planning-ui** — the planning panel/flow extended here.

## Security

Frontend only; all inputs are typed enums/ids sent to existing validated endpoints. No new storage.

## Known Issues

See frontmatter (live-gate visual verification; alternative-route rendering is minimal).

## Bugs

(none yet)
