---
id: 87-plan-rendezvous-ui
title: Plan Rendezvous UI — pick unit + sector, dual route preview, order now / schedule
edition: MDD
depends_on: [85-rendezvous-routing, 86-scheduled-rendezvous-orders, 74-routed-fuel-run]
relates: [88-rendezvous-archive-and-reminder-ui]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/hooks/usePlanRendezvous.ts
  - frontend/src/components/PlanRendezvousPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/components/SupplyPanel.tsx
  - frontend/src/lib/supplyFocus.ts
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/hooks/usePlanRendezvous.test.ts
  - frontend/src/components/PlanRendezvousPanel.test.tsx
data_flow: greenfield
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [rendezvous, fuel-run, ui, maplibre, route-preview, of-8]
path: Supply/Rendezvous
integration_contracts: []
satisfies_contracts:
  - from: 85-rendezvous-routing
    function: "POST /rendezvous/plan + POST /rendezvous"
    when: "operator picks unit + sector then Order now"
    status: done
    verified_at: "frontend/src/hooks/usePlanRendezvous.ts:99 (pickSector→planRendezvous), :130 (orderNow→createRendezvous)"
  - from: 86-scheduled-rendezvous-orders
    function: "POST /rendezvous/schedule"
    when: "operator chooses Plan rendezvous → sim-time delay → Send order"
    status: done
    verified_at: "frontend/src/hooks/usePlanRendezvous.ts:152 (schedule→scheduleRendezvous)"
known_issues:
  - "Requester asked for a sim-clock date/time input; implemented as a relative sim-time delay (hours/minutes → scheduled_game_s) because F2's schedule is a restart-safe countdown with no persisted absolute clock epoch. F4 surfaces the live countdown."
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 87 — Plan Rendezvous UI

## Purpose

The OF-8 frontend flow for a rendezvous fuel run. On a selected fuel truck the operator clicks
**Plan rendezvous** (alongside **Create fuel run**), then picks the **unit** (map click) and the
**meeting sector** (map click). The panel previews **both** movers' Safe/Fast routes on the map and
shows each one's **fuel-to-meet**. The operator then either **Order now** (immediate dispatch, F1)
or **Plan rendezvous** → a sim-time delay → **Send order** (files it as planned, F2).

## Architecture

Mirrors the Wave-12 `useFuelRun` + `FuelRunPanel` + map-preview pattern:

- **`usePlanRendezvous` hook** — state machine `idle → pick-unit → pick-sector → review`. Holds
  truck/unit ids, the sector, `truck_routes` + `unit_routes` (from `/rendezvous/plan`), and the
  selected metric. Actions: `start(truckId,name)`, `pickUnit(unitId)`, `pickSector(lat,lon)`,
  `selectMetric`, `orderNow()`, `schedule(scheduledGameS)`, `cancel()`.
- **`PlanRendezvousPanel`** — renders the truck→unit→sector summary, a Safe/Fast toggle, both
  movers' route metrics + fuel-to-meet for the chosen metric, an **Order now** button, and a
  **Plan rendezvous** toggle revealing hours/minutes delay inputs + **Send order**.
- **Map preview** — a new `rendezvous-routes` source/layer (amber) drawing both movers' selected
  metric routes bold + the alternatives faint (mirrors `fuel-run-routes`). Two new pick modes:
  `rendezvousPickUnit` (unit click → `onPickRendezvousUnit`) and `rendezvousPickSector` (any map
  click → `onPickRendezvousSector`).
- **API client** — `planRendezvous`, `createRendezvous`, `scheduleRendezvous` (+ shared TS types
  matching the F1/F2 response shapes). Esc cancels the flow (reuses the existing Esc → `clear`).

## Map indications (2026-06-09 correction)

- **Selected fuel-unit marker (purple).** Locating a fuel unit (depot or tanker) from the supply
  panel marks it with a **purple** `locate-marker` circle (recoloured from the old blue). It is the
  selection indicator for fuel units — not a permanent fleet overlay.
- **OF-8 per-tab focus** (`lib/supplyFocus.ts`, pure). The SupplyPanel reports its active tab
  (`onTabChange`); the map dims units irrelevant to that tab: Overview → only fuel fleet + depots
  bright; Supply fleet → only the fleet bright (depots dimmed); Order Fuel → only depots bright
  (all units dimmed). Dimming is data-driven via `dimmedUnitIds` (icon-opacity) + `dimDepots`.

## Data Flow

Greenfield UI over F1/F2 endpoints. `RouteOption.fuel_consumed_l` (per mover, per metric) is the
fuel-to-meet; `RendezvousPlanResponse.sector` is the snapped H3 cell centre both movers route to.

## Business Rules

- Plan-rendezvous is OF-8 only (gated by `canShow(role, 'supplyPanel')`, like fuel runs).
- The schedule delay maps to `scheduled_game_s` (`hours*3600 + minutes*60`); 0 is rejected by the
  panel (use Order now instead).
- Order-now and schedule both send the snapped sector; the backend re-plans authoritatively.

## Dependencies

- **85-rendezvous-routing** — `/rendezvous/plan` (dual routes + fuel-to-meet) + `/rendezvous` (order now).
- **86-scheduled-rendezvous-orders** — `/rendezvous/schedule` (file as planned).
- **74-routed-fuel-run** — the `useFuelRun`/`FuelRunPanel`/map-preview patterns this mirrors.

## Security

Frontend only; no secrets. The server re-plans on order/launch, so client-sent geometry is never
trusted.

## Known Issues

- Sim-clock date/time requested; implemented as a relative sim-time delay (see frontmatter).

## Bugs

(none yet — populated by /mdd bug when issues are reported)
