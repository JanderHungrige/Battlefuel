---
id: 36-advisor-ui
title: Advisor UI — Recommendations with Rationale & Apply
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-6
wave_status: active
depends_on: [33-refuel-optimizer, 34-redistribution-optimizer, 35-movement-route-advisor, 28-role-view-switch, 09-frontend-map-shell]
relates: [32-optimizer-foundation]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/components/AdvisorPanel.tsx
  - frontend/src/hooks/useAdvisor.ts
  - frontend/src/roles.ts
  - frontend/src/App.tsx
  - frontend/src/index.css
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
routes: []
models: []
test_files:
  - frontend/src/components/AdvisorPanel.test.tsx
data_flow: reads-existing
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [advisor, advice, recommendation, rationale, apply, frontend]
path: Advice/UI
integration_contracts: []
satisfies_contracts:
  - from: 28-role-view-switch
    function: "canShow(role, 'advisor')"
    when: "The Advisor panel mounts via the role registry (available in both roles)."
    status: done
    verified_at: "frontend/src/App.tsx:206"
known_issues:
  - "Movement-axis arrow is a custom NATO-style approximation, not a spec-exact APP-6 tactical mission graphic (milsymbol does not render control measures)."
security_read_sites: []
sister_projects: []
---

# 36 — Advisor UI — Recommendations with Rationale & Apply

## Purpose

The operator-facing engine: an **Advisor panel** that requests advice (reposition, refuel plan,
redistribution, and — when a unit + destination are selected — route ranking), shows each
recommendation's **rationale** and score, and offers **"apply"** to turn an applyable
recommendation into a real move / refuel / buy order.

## Architecture

```
api/types.ts + client.ts   AdviceResult/Recommendation types + getReposition/getRefuelPlan/
                           getRedistribution/getRouteAdvice
hooks/useAdvisor.ts        open/toggle, request(kind)→result, apply(rec)→existing order client,
                           busy/error; pushes a chatter line and refetches supply on apply
components/AdvisorPanel.tsx  request buttons + recommendation list (rationale, score, Apply)
roles.ts                   add 'advisor' PanelKey to both roles
App.tsx                    topbar "Advisor" toggle + mount, gated by canShow(role,'advisor')
```

## Data Model

Frontend mirrors of the backend advice domain: `RecommendationKind`, `Recommendation`
(`kind`, `target`, `action: Record<string, unknown>`, `score`, `rationale`), `AdviceResult`.

## API Endpoints

Consumes (no new endpoints): `GET /advice/reposition`, `/advice/refuel-plan`,
`/advice/redistribution`, `/advice/route`.

## Business Rules

- Buttons request each advice kind on demand; **route** is enabled only when a unit is selected
  and a destination is picked (reuses the move-planning selection).
- Each recommendation row shows its `rationale` and `score`. An **Apply** button appears only when
  `action.endpoint` is present (transfer moves from redistribution are display-only).
- **Apply** dispatches by `action.endpoint`: `move-orders` → create+confirm move order;
  `refuel-orders` → create+confirm refuel order; `buy-orders` → create+confirm buy order. On
  success a chatter line is logged and the supply overview refetched.
- The panel mounts in both roles via `canShow(role, 'advisor')`.
- **Map marking (enhancement):** clicking a recommendation row selects it and marks it on the
  map — the unit's cell is highlighted and, for movement recommendations (action carries
  `instance_id` + `dest_lat`/`dest_lon`), a **NATO-style movement-axis arrow** (shaft +
  arrowhead, `adviceArrowToGeoJSON`) is drawn from the unit to the destination. milsymbol covers
  unit icons only, not tactical mission graphics, so the arrow is a custom-drawn axis-of-advance
  approximation. Refuel/redistribution recs (no destination in `action`) highlight only.

## Data Flow

Advice endpoints → `useAdvisor.result` → `AdvisorPanel` rows. Apply → existing Wave-3/5 client
methods → server-authoritative orders; chatter + supply refresh close the loop.

## Dependencies

33/34/35 (advice endpoints), 28 (role gating), 09 (app shell); apply reuses move (13), refuel
(26), buy (27) client methods.

## Security

Read + instruct over open MVP endpoints; apply re-validates server-side. No secrets.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
