---
id: 16-live-movement-ui
title: Live Movement UI
edition: MDD
depends_on: [14-sim-engine, 15-move-planning-ui, 10-map-overlays-inspect]
relates: [15-move-planning-ui]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/config.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/components/InspectPanel.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/hooks/simSocket.test.ts
  - frontend/src/hooks/useSimSocket.test.ts
  - frontend/src/map/overlays.test.ts
  - frontend/src/components/InspectPanel.test.tsx
data_flow: .mdd/audits/flow-live-movement-ui-2026-06-01.md
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [websocket, simulation, realtime, maplibre, frontend, fuel, movement]
path: Map/Movement
integration_contracts: []
satisfies_contracts:
  - from: 14-sim-engine
    function: "WS /api/v1/ws (unit_update broadcast)"
    when: "while any move order is active"
    status: done
    verified_at: "frontend/src/App.tsx:48"
security_read_sites: []
known_issues:
  - "Live animation against a running sim backend is verified manually; jsdom has no WebGL/WebSocket, so automated tests cover the pure frame parser/reducer (simSocket), the useSimSocket hook (mock WebSocket), the overlay helpers, and the InspectPanel live section. The WS frame shape was checked statically against backend/app/services/sim_runner.py."
---

# 16 — Live Movement UI

## Purpose

Animates the server-authoritative simulation in the browser: subscribes to the sim
WebSocket, moves each unit's map marker along its route as the backend ticks, keeps the
active route drawn, and shows fuel depleting live for the moving unit — completing the
Wave 3 demo ("watch the unit traverse the route in real time as its fuel depletes").

## Architecture

A `useSimSocket` hook owns a single WebSocket to `{WS_BASE}/ws`, reconnecting on drop. It
reduces incoming `unit_update` frames into a `Record<instance_id, UnitUpdate>` map. `App`
feeds that map to `MapView` (which overrides unit marker coordinates from the live
positions and draws active routes) and to `InspectPanel` (live fuel/progress for the
selected unit). Message parsing/reduction lives in a pure `simSocket.ts` module so it is
unit-testable without a socket.

```
sim tick (backend) → WS unit_update → useSimSocket reducer
  App.livePositions ─→ MapView: marker moves + active route line
  App.activeRoutes  ─→ MapView: route stays drawn until status complete/cancelled
  App.live[selected]─→ InspectPanel: fuel & progress update live
```

## Data Model

No persistence. New TS type mirrors the broadcast frame:

- `UnitUpdate { type: 'unit_update', instance_id, order_id, lat, lon, fuel_l, status, progress_m, distance_m }`

## API Endpoints

Consumes (does not define): `WS /api/v1/ws` — server→client only; the client ignores the
send direction. `WS_BASE` is derived from `API_BASE` (`http`→`ws`).

## Business Rules

- One socket for the app, opened on mount; auto-reconnect ~2 s after an unexpected close.
- Latest frame per `instance_id` wins; malformed frames are logged and skipped (the socket
  is not torn down by a single bad frame).
- A unit with a live position renders at that position (overriding its seeded coordinates).
- Live positions are kept for `active` and terminal `complete` units (so a unit does not
  snap back to its start on arrival); a `cancelled` unit reverts to its base position.
- An active route (geometry captured at confirm in feature 15) stays drawn until the WS
  reports that unit `complete` or `cancelled`, then it is removed.

## Data Flow

See `.mdd/audits/flow-live-movement-ui-2026-06-01.md`. Positions and fuel are rendered
verbatim from the WS frame; the client performs no interpolation or fuel computation.

## Dependencies

- **14-sim-engine** — the `unit_update` WebSocket broadcast.
- **15-move-planning-ui** — supplies the confirmed order geometry drawn as the active route.
- **10-map-overlays-inspect** — unit markers and the inspect panel.

## Security

No new external input surface; the socket is read-only inbound and frames are validated
(type + instance_id) before use. Single-user, server-authoritative.

## Known Issues

<!-- populated by audits -->

## Bugs

(none yet — populated by /mdd bug when issues are reported)
