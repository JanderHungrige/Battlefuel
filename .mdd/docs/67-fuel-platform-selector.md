---
id: 67-fuel-platform-selector
title: Fuel-Management Platform Selector
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: [66-order-fuel-rename-and-dropdown-bug]
source_files:
  - backend/app/domain/fuel_platform.py
  - backend/app/models/fuel_platform.py
  - backend/app/providers/fuel_platforms.py
  - backend/app/services/fuel_platform_seed.py
  - backend/app/api/fuel_platforms.py
  - backend/alembic/versions/0011_create_fuel_platforms.py
  - frontend/src/hooks/useFuelPlatforms.ts
  - frontend/src/components/SupplyPanel.tsx
routes:
  - GET /api/v1/fuel-platforms
  - POST /api/v1/fuel-platforms
models:
  - fuel_platforms
test_files:
  - backend/tests/test_fuel_platforms.py
  - frontend/src/hooks/useFuelPlatforms.test.ts
data_flow: greenfield
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, supply, fuel-platform, world-fuel-dfms, shell-fm, order-fuel]
path: OF-8/Supply
integration_contracts:
  - consumer: 68-order-fuel-mask
    function: selected FuelPlatform (id, name, logo_key)
    when: order mask is opened — drives the mask branding
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 67 — Fuel-Management Platform Selector

## Purpose

Add a dropdown above the OF-8 order form to pick the **fuel-management platform** an order
is placed through. Seeds **World Fuel DFMS** (default) and **Shell FM**, and lets the
operator **add a new platform**. The selected platform drives the F3 order-mask branding.

## Architecture

New first-class entity `FuelPlatform`, persisted via the same provider/factory pattern as
depots/buy-orders (`build_fuel_platform_provider` selected by `settings.fuel_platform_provider`,
default `db`). Read/create endpoints under `/api/v1`. Frontend `useFuelPlatforms` loads the
list, tracks the selected platform, and can append a new one; `SupplyPanel` renders the
selector.

## Data Model

`fuel_platforms` table:
- `id` (str, PK) — slug, e.g. `platform-world-fuel-dfms`
- `name` (str) — display name
- `logo_key` (str, nullable) — asset slug (`world-fuel`, `shell-fm`) the frontend maps to a logo
- `is_default` (bool, default false) — the platform pre-selected on load
- `created_at` (datetime)

Seeded rows: World Fuel DFMS (`logo_key=world-fuel`, default), Shell FM (`logo_key=shell-fm`).

## API Endpoints

- `GET /api/v1/fuel-platforms` → `FuelPlatform[]` (default first, then by name)
- `POST /api/v1/fuel-platforms` `{ name, logo_key? }` → `FuelPlatform` (201). id derived from a
  slugified name; user-added platforms are never default and carry no logo unless provided.

## Business Rules

- Exactly the seeded World Fuel DFMS row is `is_default: true`; user-added platforms are not.
- A user-added platform with no `logo_key` falls back to a generic badge in the mask (F3).
- Adding a platform with a name that slugs to an existing id returns the existing row
  (idempotent create) rather than erroring.

## Data Flow

Greenfield entity. Selected platform is surfaced to F3 (order mask) via `useFuelPlatforms`
state (`selectedPlatform`).

## Dependencies

- 66 (order-fuel rename) — same OF-8 order form this selector sits above.

## Security

Input-accepting endpoint: `POST /fuel-platforms` takes an operator-supplied `name`/`logo_key`.
Single-user server-authoritative app; `name` is trimmed and length-bounded, `logo_key` is
slug-validated. No path/host data is accepted, nothing is executed.

## Known Issues

(none)

## Bugs

(none yet)
