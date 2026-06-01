---
id: 29-of8-supply-ui
title: OF-8 Supply UI — Distribution, Buy & Refuel Order Placement
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [25-supply-stock-api, 26-refuel-orders, 27-buy-orders, 28-role-view-switch, 09-frontend-map-shell]
relates: [30-strategic-support-chatter]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/hooks/useSupply.ts
  - frontend/src/components/SupplyPanel.tsx
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - frontend/src/components/SupplyPanel.test.tsx
  - frontend/src/hooks/simSocket.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [of-8, supply, distribution, buy-order, refuel-order, rendezvous, frontend, websocket]
path: Supply/UI
integration_contracts: []
satisfies_contracts:
  - from: 28-role-view-switch
    function: "canShow(role, panelKey)"
    when: "SupplyPanel + depot overlay mount via canShow(role,'supplyPanel'/'depotOverlay'), not ad-hoc role checks."
    status: done
    verified_at: "frontend/src/App.tsx:244"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 29 — OF-8 Supply UI — Distribution, Buy & Refuel Order Placement

## Purpose

The OF-8 experience: see fuel stocks and distribution across depots and mobile trucks, place a
**buy order** to replenish a depot, and place a **refuel order** for a unit — which surfaces the
recommended fuel truck and a rendezvous (both highlighted on the map). Live order frames keep
the distribution view current.

## Architecture

```
api/types.ts + client.ts   FuelDepot/FuelStock/SupplyOverview/BuyOrder/RefuelOrder types +
                           getDepots, getSupplyOverview, createBuyOrder(+confirm/cancel),
                           createRefuelOrder(+confirm/cancel)
hooks/simSocket.ts         parseBuyOrderUpdate / parseRefuelOrderUpdate (pure)
hooks/useSimSocket.ts      reduces those frames → supplyTick counter + chatter lines
hooks/useSupply.ts         loads depots + overview; refetch(); auto-refetch on supplyTick
components/SupplyPanel.tsx OF-8 panel: distribution + buy form + refuel form (+ recommendation)
map/overlays.ts            depotsToGeoJSON()
map/MapView.tsx            depots overlay + rendezvous marker (once-init + imperative setData)
App.tsx                    mounts SupplyPanel / depot overlay when canShow(role, …); wires the
                           refuel rendezvous highlight
```

## Data Model

Frontend mirrors of the Wave-5 backend schemas: `FuelDepot`, `FuelStock`, `DepotFuel`,
`TruckFuel`, `SupplyOverview`, `BuyOrder`, `RefuelOrder`, plus WS frames `BuyOrderUpdate`
(`buy_order_update`) and `RefuelOrderUpdate` (`refuel_order_update`).

## API Endpoints

Consumes (no new endpoints): `GET /depots`, `GET /supply/overview`, `POST /buy-orders`
(+`/confirm`,`/cancel`), `POST /refuel-orders` (+`/confirm`,`/cancel`).

## Business Rules

- SupplyPanel and the depot overlay mount only when `canShow(role, 'supplyPanel' | 'depotOverlay')`
  — i.e. in OF-8.
- **Distribution view:** per-depot stock (quantity / capacity per fuel type), totals by fuel type,
  and mobile trucks (name, fuel / capacity, or "no telemetry").
- **Buy order:** choose depot + fuel type + quantity → `createBuyOrder` then `confirmBuyOrder`;
  a chatter line records it. Only (depot, fuel-type) pairs the depot stocks are offered.
- **Refuel order:** choose a thirsty (non-fuel) unit → `createRefuelOrder`; the response's
  recommended truck + rendezvous are shown, the truck cell is highlighted and a rendezvous marker
  is dropped on the map, with copy that the operator moves the truck (OF-4 move order). Confirm →
  `confirmRefuelOrder`. 422 (no truck) surfaces a clear message.
- **Live:** `buy_order_update` / `refuel_order_update` frames bump `supplyTick`; `useSupply`
  refetches the overview so stock/trucks stay current without a reload. Malformed frames dropped
  with a logged warning (existing pattern).

## Data Flow

Backend supply/order state → `useSupply` (overview) + order responses → SupplyPanel display +
map overlay/highlight. Order WS frames → `supplyTick` → refetch.

## Dependencies

25 (read API), 26 (refuel + recommendation/rendezvous), 27 (buy), 28 (role gating),
09 (map shell / MapView once-init pattern).

## Security

Read/instruct UI over open MVP endpoints; no secrets. Numeric inputs constrained in the form;
the backend re-validates.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
