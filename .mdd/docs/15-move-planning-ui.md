---
id: 15-move-planning-ui
title: Move Planning UI
edition: MDD
depends_on: [12-route-planning-api, 13-move-orders, 10-map-overlays-inspect, 09-frontend-map-shell]
relates: [16-live-movement-ui, 10-map-overlays-inspect]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/components/MoveRoutesPanel.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/api/client.test.ts
  - frontend/src/map/overlays.test.ts
  - frontend/src/components/MoveRoutesPanel.test.tsx
data_flow: .mdd/audits/flow-move-planning-ui-2026-06-01.md
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [routing, move-orders, planning, maplibre, frontend, fuel, threat]
path: Map/Movement
integration_contracts: []
satisfies_contracts:
  - from: 12-route-planning-api
    function: "POST /api/v1/routes/plan"
    when: "user selects a unit and clicks a destination"
    status: done
    verified_at: "frontend/src/App.tsx:103"
  - from: 13-move-orders
    function: "POST /api/v1/move-orders (+ /{id}/confirm)"
    when: "user confirms a chosen route option"
    status: done
    verified_at: "frontend/src/App.tsx:119"
security_read_sites: []
known_issues:
  - "Live browser click-through (map clicks + real backend round-trip) is verified manually; jsdom has no WebGL, so automated tests cover the pure GeoJSON helpers, the API client (POST contracts), and MoveRoutesPanel. API contracts were checked statically against backend/app/ source."
---

# 15 — Move Planning UI

## Purpose

Lets the operator turn a unit and a map click into a movement decision: select a unit,
click a destination, see the **fastest** and **safest** route options with distance,
duration, fuel consumed/remaining and route threat, then confirm one — which creates and
activates a move order the sim engine will execute.

## Architecture

Frontend-only feature on top of the existing map shell. It introduces a **planning mode**
in `MapView`: while a unit is selected, the next click on open map sets the destination
(`lngLat`) instead of clearing the selection. App fetches route options from the backend,
renders them in a new `MoveRoutesPanel`, and draws the selected option's geometry plus a
destination marker as new MapLibre layers.

`MapView` is refactored from "rebuild the whole map on every prop change" to
**once-init + imperative source updates** (`source.setData(...)`), so adding route /
destination overlays (and, in feature 16, live unit motion) does not tear down the map.

```
unit selected → planning mode on
  click open map → onPickDestination(lat,lon)
    App: api.planRoute({instance_id, dest_lat, dest_lon}) → RouteOption[]
      MoveRoutesPanel shows fastest/safest
        user picks option → route line drawn
          Confirm → api.createMoveOrder({…, metric}) → api.confirmMoveOrder(id)
            order active → (feature 16 animates it)
```

## Data Model

No persistence added. New TS types mirror backend schemas:

- `RouteMetric = 'fast' | 'safe'`
- `RouteOption { label, metric, geometry: number[][], distance_m, duration_s, threat_max, threat_avg, fuel_consumed_l, fuel_remaining_l, sufficient_fuel }`
- `MoveOrder { id, instance_id, status, metric, distance_m, duration_s, fuel_consumed_l, progress_m, geometry: number[][] }`
- request types `PlanRouteRequest`, `CreateMoveOrderRequest`

## API Endpoints

Consumes (does not define) backend endpoints:

- `POST /api/v1/routes/plan` — `{instance_id, dest_lat, dest_lon}` → `RouteOption[]`
- `POST /api/v1/move-orders` — `{instance_id, dest_lat, dest_lon, metric}` → `MoveOrder`
- `POST /api/v1/move-orders/{id}/confirm` → `MoveOrder`
- `POST /api/v1/move-orders/{id}/cancel` → `MoveOrder`

Adds a `postJson` helper to `api/client.ts` and `api.planRoute`, `api.createMoveOrder`,
`api.confirmMoveOrder`, `api.cancelMoveOrder`, `api.listMoveOrders`.

## Business Rules

- Planning mode is active only when a unit is selected. Selecting a tile or clearing the
  selection exits planning mode and clears destination + route options.
- A destination click sends the raw `lngLat` (`dest_lat`, `dest_lon`) to the planner.
- Two options are expected (fastest, safest); the panel renders whatever the server
  returns, keyed by `metric`.
- If an option's `sufficient_fuel` is `false`, the panel flags it (insufficient fuel) but
  still allows confirming — the server is authoritative on whether to accept.
- Confirm = create order with the chosen `metric`, then confirm it (pending → active). On
  success the planning UI closes for that unit.
- `422` (no route) and `404`/`409` from the planner surface as an inline error in the panel.

## Data Flow

See `.mdd/audits/flow-move-planning-ui-2026-06-01.md`. The frontend displays server-computed
route/fuel/threat values verbatim; it computes nothing about routing itself.

## Dependencies

- **12-route-planning-api** — route options (`POST /routes/plan`).
- **13-move-orders** — order create/confirm/cancel.
- **10-map-overlays-inspect / 09-frontend-map-shell** — map shell, unit selection, overlays.

## Security

No new external input surface beyond existing API calls; the backend validates
`instance_id` and coordinates. No secrets, no new storage. (Single-user, server-authoritative.)

## Known Issues

<!-- populated by audits -->

## Bugs

(none yet — populated by /mdd bug when issues are reported)
