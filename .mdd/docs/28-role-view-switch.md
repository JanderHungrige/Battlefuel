---
id: 28-role-view-switch
title: Role View Switch — OF-4 ↔ OF-8 Frontend Filter
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [09-frontend-map-shell]
relates: [29-of8-supply-ui, 30-strategic-support-chatter, 31-unit-overview-telemetry]
source_files:
  - frontend/src/roles.ts
  - frontend/src/components/RoleToggle.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/roles.test.ts
  - frontend/src/components/RoleToggle.test.tsx
data_flow: greenfield
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [role, of-4, of-8, view-filter, frontend, panels]
path: Supply/Roles
integration_contracts:
  - function: "canShow(role, panelKey)"
    when: "OF-8 panels (29-of8-supply-ui, 30-strategic-support-chatter) and the unit overview (31) mount themselves through the role→panel registry, not ad-hoc role checks."
    consumers: [29-of8-supply-ui, 30-strategic-support-chatter, 31-unit-overview-telemetry]
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 28 — Role View Switch — OF-4 ↔ OF-8 Frontend Filter

## Purpose

Add a second operator role. A topbar toggle switches between **OF-4** (battalion / tactical)
and **OF-8** (joint-force / supply) views, deciding which panels and overlays render. For the
single-user MVP this is a **pure frontend view filter** — all `/api/v1` endpoints stay open;
this matches the locked "single-user, server-authoritative, multi-user later without a rewrite"
decision.

## Architecture

```
roles.ts                 Role type, ROLES list, PanelKey, ROLE_PANELS registry, canShow()
components/RoleToggle.tsx topbar OF-4 / OF-8 switch
App.tsx                  holds role state; gates panels via canShow(role, key)
```

The role→panel mapping is **declarative** (`ROLE_PANELS: Record<Role, Set<PanelKey>>`) so the
OF-8 supply UI (29), strategic feed (30), and unit overview (31) mount themselves by asking
`canShow(role, key)` rather than scattering `role === 'OF8'` checks — and a future server-driven
role slots into the same registry without a rewrite.

## Data Model

Frontend only, no persistence. `Role = 'OF4' | 'OF8'`. `PanelKey` enumerates the mountable
surfaces:
- OF-4 (tactical): `obstacleMode`, `moveRoutes`, `obstaclePicker`, `terrainLegend`
- OF-8 (supply): `supplyPanel`, `depotOverlay`, `strategicFeed` (wired by 29/30)
- shared: `inspect`, `chatter`, `unitOverview`

## API Endpoints

None.

## Business Rules

- Default role is **OF-4** (preserves the Wave 1–4 experience unchanged).
- `canShow(role, panelKey)` returns whether a panel mounts for the active role. App gates
  tactical tools with it; switching to OF-8 hides obstacle mode / move planning / obstacle
  picker / terrain legend and (once 29 lands) shows the supply surfaces.
- Switching to OF-8 forces obstacle-placement mode off (it is a tactical-only tool).
- The map, tile/unit inspect, and chatter are shared (mount in both roles).

## Data Flow

Greenfield UI state. `role` lives in `App` and flows into `canShow` gates and `RoleToggle`.

## Dependencies

- **09-frontend-map-shell** — the App shell / topbar this toggle and the gating extend.

## Security

No security surface — a client-side view filter only; endpoints remain open by design (MVP).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
