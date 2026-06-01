---
id: 31-unit-overview-telemetry
title: Unit Overview & Telemetry Request
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [08-unit-instances, 04-unit-query-api, 28-role-view-switch, 09-frontend-map-shell]
relates: [29-of8-supply-ui]
source_files:
  - backend/app/api/unit_instances.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/components/UnitOverview.tsx
  - frontend/src/hooks/useUnitOverview.ts
  - frontend/src/App.tsx
  - frontend/src/index.css
routes:
  - POST /api/v1/unit-instances/{instance_id}/telemetry
models:
  - unit_instances
test_files:
  - backend/tests/test_unit_telemetry.py
  - frontend/src/components/UnitOverview.test.tsx
data_flow: writes-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [unit-overview, telemetry, missing-data, manual-update, frontend]
path: Units/Overview
integration_contracts: []
satisfies_contracts:
  - from: 28-role-view-switch
    function: "canShow(role, 'unitOverview')"
    when: "The unit overview mounts through the role registry (available in both roles)."
    status: done
    verified_at: "frontend/src/App.tsx:166"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 31 — Unit Overview & Telemetry Request

## Purpose

A per-unit overview listing stats (type, echelon, status, fuel) for every placed unit. Units
with **no fuel telemetry** (`current_fuel_liters === null`) are flagged and offer a **"request
manual update"** action that sets the value via a new backend endpoint — closing the
"no data → request manual update" loop the data model was designed for since Wave 2.

## Architecture

```
backend/api/unit_instances.py  POST /unit-instances/{id}/telemetry — sets fuel via provider.set_fuel
frontend/components/UnitOverview.tsx  list of units + per-unit stats + inline manual-update form
frontend/hooks/useUnitOverview.ts     open/toggle state + setTelemetry (calls API, updates roster)
App.tsx                               topbar "Units" toggle; mounts the overview (both roles)
```

## Data Model

No new tables. Reuses `unit_instances.current_fuel_liters` (`null` = no telemetry, the
`has_telemetry` concept from Wave 2). The telemetry endpoint writes through the existing
`UnitInstanceProvider.set_fuel` mutation path.

## API Endpoints

| Method | Path | Body / Result |
|--------|------|---------------|
| POST | `/api/v1/unit-instances/{id}/telemetry` | `{current_fuel_liters >= 0}` → updated `UnitInstance` (404 if unknown) |

## Business Rules

- The overview lists all placed units with: name, unit-type name, echelon, status, and fuel —
  shown as `current / capacity L` or **"no data"** when `current_fuel_liters` is null.
- A no-data unit shows a **"request manual update"** control; submitting a non-negative number
  POSTs to the telemetry endpoint, which sets the fuel server-side and returns the updated unit;
  the frontend roster updates so the flag clears.
- The overview is available in both roles (`canShow(role, 'unitOverview')`), toggled from the
  topbar.

## Data Flow

`unit_instances` + unit-type metadata → UnitOverview rows. Manual update → POST telemetry →
`set_fuel` → updated `UnitInstance` → roster state refresh (flag clears).

## Dependencies

08 (instances + `set_fuel`), 04 (unit-type names/echelon/capacity), 28 (role registry),
09 (app shell / topbar).

## Security

Single-user MVP; the endpoint takes a validated non-negative number and writes server-side
game state. No auth. No secrets.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
