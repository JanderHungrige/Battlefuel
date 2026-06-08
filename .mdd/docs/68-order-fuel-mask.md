---
id: 68-order-fuel-mask
title: Order-Fuel Mask (Branded Order Modal)
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-11
wave_status: active
depends_on: [67-fuel-platform-selector]
source_files:
  - backend/app/domain/buy_order.py
  - backend/app/models/buy_order.py
  - backend/app/providers/buy_orders.py
  - backend/app/services/buy_service.py
  - backend/app/api/buy_orders.py
  - backend/alembic/versions/0012_add_buy_order_mask_fields.py
  - frontend/src/components/OrderFuelMask.tsx
  - frontend/src/lib/platformLogo.ts
  - frontend/src/components/SupplyPanel.tsx
  - frontend/src/hooks/useSupplyOrders.ts
  - frontend/scripts/sync-assets.mjs
routes:
  - POST /api/v1/buy-orders
models:
  - buy_orders
test_files:
  - backend/tests/test_buy_orders.py
  - frontend/src/components/OrderFuelMask.test.tsx
  - frontend/src/lib/platformLogo.test.ts
data_flow: writes-existing
last_synced: 2026-06-05
status: complete
phase: all
mdd_version: 11
tags: [of8, order-fuel, order-mask, buy-order, jlsg, jtf, branding]
path: OF-8/Supply
integration_contracts:
  - consumer: 69-order-history-panel
    function: buy_orders carries platform_id / inform_jlsg / inform_jtf / destination_name
    when: order history renders an order's procurement metadata
satisfies_contracts:
  - from: 67-fuel-platform-selector
    function: selected FuelPlatform drives mask branding (logo + name)
    when: the order mask is opened
    status: done
    verified_at: "frontend/src/components/OrderFuelMask.tsx:38"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 68 — Order-Fuel Mask (Branded Order Modal)

## Purpose

Replace the one-click "Order fuel" button with a **faked branded order mask**: the selected
fuel-platform logo on top, the fuel type / destination / amount prefilled, **inform
checkboxes (JLSG, JTF HQ)**, and a **Place order** button that posts the order (now carrying
the platform + inform + destination metadata) and shows a confirmation.

## Architecture

The order placement still goes through the existing buy-order flow (`POST /buy-orders` →
`create_buy_order`), extended to persist four order-mask fields. The frontend `OrderFuelMask`
modal collects the inform flags and confirms the prefilled fuel/destination/amount, then calls
the extended `placeBuy`. `platformLogo.ts` maps a platform `logo_key` to a committed logo
served from `/logos/` (sync-assets copies `company Logos/` into `public/logos/`).

## Data Model

`buy_orders` gains (all nullable / defaulted, back-compatible):
- `platform_id` (str, nullable) — the fuel-management platform the order was placed through
- `inform_jlsg` (bool, default false) — inform the Joint Logistic Support Group
- `inform_jtf` (bool, default false) — inform Joint Task Force HQ
- `destination_name` (str, nullable) — human label for the destination depot/site

## API

`POST /api/v1/buy-orders` request gains optional `platform_id`, `inform_jlsg`, `inform_jtf`,
`destination_name`. Response (`BuyOrder`) includes them. Existing callers (no new fields) keep
working — fields default.

## Business Rules

- The mask prefills fuel type + destination from the panel's current depot/fuel selection and
  the amount from the quantity input; amount stays editable in the mask.
- Inform checkboxes default unchecked; their state is persisted on the order.
- A platform with a known `logo_key` shows its logo; an unknown/empty `logo_key` shows a text
  badge with the platform name (so user-added platforms still render).
- Placing the order closes the mask and surfaces a confirmation message.

## Data Flow

`platform_id`/inform/destination: collected in the mask → `placeBuy` → `POST /buy-orders` →
persisted on `buy_orders` → surfaced by the F4 order-history panel.

## Dependencies

- 67 (fuel-platform-selector) — supplies the selected platform that brands the mask.

## Security

Input-accepting endpoint extension: the new fields are operator-supplied. `destination_name`
is length-bounded; booleans are coerced; `platform_id` is a free string but only used as a
display join key (no lookup-or-execute). Single-user server-authoritative app.

## Known Issues

- (resolved) Shell FM logo committed (`shell-logo-png-transparent.png`); operator-added
  platforms with no committed logo still fall back to a text badge.

## Bugs

(none yet)
