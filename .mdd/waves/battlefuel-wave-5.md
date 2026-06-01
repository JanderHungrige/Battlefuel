---
id: battlefuel-wave-5
title: "Wave 5: Joint-Force Supply — OF-8 View, Fuel Stocks, Buy & Refuel Orders"
initiative: battlefuel
initiative_version: 4
status: planned
depends_on: battlefuel-wave-4
demo_state: "Switch to the OF-8 (joint-force) view to see fuel stocks and distribution across depots; place a fuel buy order that replenishes a depot over sim-time; place a refuel order that recommends the closest fuel truck and a rendezvous (the operator moves the truck manually, and transfer happens when co-located); receive strategic support messages; and open a unit overview that surfaces missing telemetry with a 'request manual update' action."
created: 2026-06-01
hash: 78b2bbd4
---

# Wave 5: Joint-Force Supply — OF-8 View, Fuel Stocks, Buy & Refuel Orders

## Demo-State
**Switch to the OF-8 (joint-force) view** and see **fuel stocks and distribution** across the
theater's depots. **Place a fuel buy order** that replenishes a depot's stock over sim-time.
**Place a refuel order** for a thirsty unit — the system **recommends the closest fuel truck
and a rendezvous point** and highlights both; the operator **manually moves the truck** (reusing
Wave-3 move orders), and **fuel transfers when the two are co-located**. **Strategic support
messages** arrive in the OF-8 feed. A **unit overview** lists per-unit stats and surfaces units
with **missing telemetry**, offering a **"request manual update"** action.
*(This wave is not complete until this can be manually demonstrated.)*

## Scope
Waves 1–4 built the tactical (OF-4) world: a unit catalog, an offline hex map, threat-aware
routing, real-time movement/fuel burn, and a dynamic, event-driven battlefield. Wave 5 adds the
**joint-force (OF-8) supply layer** on top of that world:

- **Fuel as a tracked, finite resource in the theater.** Depots hold fuel stock by fuel type at
  fixed supply-point locations; mobile fuel trucks (tankers) carry their own fuel and draw from
  depots. A distribution picture answers "how much fuel is where."
- **Two supply orders (kept as distinct features):**
  - **Buy orders** procure fuel *into* a depot — stock arrives after a lead time advanced by the
    sim clock (server-authoritative, like move orders).
  - **Refuel orders** move fuel *from* a truck into a unit. Transfer happens **only when the unit
    and the truck occupy the same position.** Creating the order runs a **placeholder
    recommender** that picks the closest/"optimal" fuel truck and proposes a **rendezvous**; the
    operator then **manually moves the truck** there. Full optimization is deferred to Wave 6.
- **A second operator role.** An **OF-4 ↔ OF-8 view toggle** decides which panels and overlays
  render. For this single-user MVP the role is a **frontend view filter** — all `/api/v1`
  endpoints stay open; this matches the locked "single-user, server-authoritative, multi-user
  later without a rewrite" decision.
- **Strategic support messages.** OF-8 receives strategic-level chatter (e.g. "convoy inbound",
  "depot X resupplied", "buy order N delivered") via a scripted feed + a new WS frame, reusing
  the Wave-4 chatter infrastructure.
- **Unit overview with telemetry gaps.** A per-unit stats overview that uses the *already-modeled*
  `current_fuel_liters = None` / `has_telemetry` state to flag units with no data and offer a
  **"request manual update"** action wired to a backend endpoint.

**Locked inputs (initiative):** Python/FastAPI backend, React + MapLibre frontend, PostgreSQL +
PostGIS, factory-pattern data layer for every source, continuous real-time sim over WebSockets,
single-user server-authoritative, APP-6 symbology. **Deferred to Wave 6:** the real
optimization/fuel-order algorithm (OR-Tools) — Wave 5 ships a clearly-seamed placeholder.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | fuel-supply-model        | — | planned | — |
| 2 | supply-stock-api         | — | planned | fuel-supply-model |
| 3 | refuel-orders            | — | planned | fuel-supply-model |
| 4 | buy-orders               | — | planned | fuel-supply-model |
| 5 | role-view-switch         | — | planned | — |
| 6 | of8-supply-ui            | — | planned | supply-stock-api, refuel-orders, buy-orders, role-view-switch |
| 7 | strategic-support-chatter | — | planned | role-view-switch, of8-supply-ui |
| 8 | unit-overview-telemetry  | — | planned | role-view-switch |

Build order: 1 → (2, 3, 4 after 1) → 5 (independent, can run anytime) → 6 (after 2, 3, 4, 5)
→ 7 (after 5, 6) → 8 (after 5).

### Feature notes
- **fuel-supply-model** — backend foundation. `FuelDepot` (location/H3 cell, name, per-fuel-type
  capacity & current stock) and `FuelStock` (depot × fuel-type → quantity) domain models +
  ORM rows + an Alembic migration (next number after `0007`). Follow the factory pattern: a
  `DepotProvider` / `StockProvider` ABC in `providers/` with a `Db…` implementation registered in
  the factory, selectable by config — never hard-wire the source. Seed depots at existing
  `SUPPLY_POINT` tiles and give the seeded tanker (`inst-fuel-1`) a starting fuel load. Mobile
  fuel trucks reuse the existing `UnitInstance` (tanker types already exist:
  `nato_unit_type=FUEL_SUPPLY`, `fuel-supply-pl`); a truck's carried fuel is its
  `current_fuel_liters`. Single source of truth for "what is a fuel source" so refuel/buy build on it.
- **supply-stock-api** — read side. `GET /api/v1/depots`, `GET /api/v1/depots/{id}`,
  `GET /api/v1/fuel-stocks` (per depot and/or fuel type) and a small **distribution overview**
  endpoint summarizing fuel-on-hand by depot/type plus mobile-truck fuel. All served through the
  providers from feature 1. No mutation here. Versioned under `/api/v1/`.
- **refuel-orders** — `RefuelOrder` model + API (`POST /api/v1/refuel-orders`,
  `…/{id}/confirm`, `…/{id}/cancel`, `GET …/{id}`) mirroring the Wave-3 move-order shape and
  lifecycle. Core rules: **transfer executes only when the target unit and the assigned fuel
  truck share a position** (same H3 cell) — server-authoritative decrement of truck fuel and
  top-up of unit fuel, respecting unit capacity and truck stock. On creation, the API calls a
  **pluggable `RefuelRecommender` interface** (ABC/Protocol, one method
  `recommend(unit, trucks, depots, *, clock) -> RefuelRecommendation`) to pick the truck and a
  **rendezvous suggestion**; it does **not** dispatch the truck. Treat the recommender exactly
  like the project's data providers — **registered in the factory and config-selected**
  (`settings.refuel_recommender = "nearest"` for Wave 5's simple nearest-by-distance heuristic;
  `"ortools"` is added in **Wave 6** as a *new implementation*, never an edit to the placeholder).
  The return type `RefuelRecommendation` (chosen truck id, rendezvous, plus optional
  `score`/`rationale` the optimizer fills and the placeholder leaves empty) is **stable** so a
  richer algorithm enriches the result without changing the shape; callers (API/service) depend
  on the interface only, never the concrete heuristic. The sim/order checks co-location (driven by
  the operator's manual move orders) and completes the transfer, broadcasting a frame.
  Deterministic unit tests for the transfer math (inject clock/positions).
- **buy-orders** — `BuyOrder` model + API (`POST /api/v1/buy-orders`, `…/{id}/confirm`,
  `…/{id}/cancel`, `GET …/{id}`). Procures fuel **into a depot**: an order has a quantity, fuel
  type, target depot, and a **lead time**; the **sim engine** advances it (like move orders) and,
  when due, increments depot stock via the StockProvider and broadcasts delivery. Server-
  authoritative; deterministic test with injected clock.
- **role-view-switch** — frontend **OF-4 ↔ OF-8 toggle** in the topbar. Pure **view filter**:
  a single role state in `App.tsx` decides which panels/overlays mount (OF-4 → tactical move/
  inspect/obstacle tools; OF-8 → supply overlay, distribution panel, strategic feed). No backend
  enforcement, endpoints stay open. Keep the toggle and the per-role panel registry small and
  declarative so future server-side roles slot in without a rewrite.
- **of8-supply-ui** — the OF-8 experience. A **fuel stocks & distribution** panel (reads
  `supply-stock-api`), a **depot/stock map overlay** (MapLibre source updated imperatively, per
  the established pattern), and the **order placement UX**: place a **buy order** for a depot, and
  place a **refuel order** for a unit — which calls the recommender and then **highlights both the
  thirsty unit and the recommended fuel truck and indicates where to meet**, with copy making
  clear the operator moves the truck manually. Subscribe to the new WS frames to update stocks/
  orders live.
- **strategic-support-chatter** — strategic support messages for OF-8. A scripted/seeded
  strategic feed (keyed to sim game-time, like the Wave-4 tile feed) plus order-driven
  notifications (buy delivered, refuel complete) emitted as a WS frame and rendered in an OF-8
  feed reusing the Wave-4 `ChatterLog` component/infrastructure. Pure parse/reduce for the new
  frame in the socket module; drop malformed frames with a logged warning.
- **unit-overview-telemetry** — a **unit overview** list (per-unit stats: type, echelon, fuel,
  status, telemetry freshness). Units with `current_fuel_liters = None` / `has_telemetry == false`
  are flagged "no data" and show a **"request manual update"** action wired to a small backend
  endpoint (e.g. `POST /api/v1/unit-instances/{id}/telemetry-request` or a manual-set endpoint).
  Leans entirely on already-modeled missing-telemetry state; mainly UI + one endpoint.

## Open Research
- **Fuel-source model** — confirm depots-as-fixed-locations + tankers-as-mobile-`UnitInstance`
  split (vs. a unified "fuel store" abstraction); how a truck draws from a depot vs. carrying its
  own `current_fuel_liters`; whether stock is per-(depot, fuel-type) rows or a JSON column.
- **Refuel co-location test** — exact "same position" rule (same H3 cell vs. distance threshold),
  and how the order observes co-location given the operator drives the truck via manual move
  orders (poll on sim tick vs. event on move-order completion).
- **Recommender seam** — finalize the `RefuelRecommender` interface and the stable
  `RefuelRecommendation` return type (truck id, rendezvous, optional `score`/`rationale`), wired
  through the factory + config so the Wave-6 OR-Tools optimizer drops in as a *new registered
  implementation* without touching callers. Open detail: what "rendezvous" means when transfer
  requires identical position (meet-at-unit vs. meet-at-midpoint vs. meet-at-depot), and whether
  the recommender also returns a ranked list (for future multi-truck plans) vs. a single choice.
- **Buy-order lead time** — where lead time comes from (fixed per fuel type? per depot? config?),
  and how delivery is advanced/branched off the existing sim runner without bloating the tick.
- **New WS frame contracts** — shapes for `fuel_stock_update`, `buy_order_update`,
  `refuel_order_update`, and `strategic_message`; how the frontend reconciles each into state.
- **Role view registry** — the cleanest declarative mapping of role → mounted panels/overlays in
  `App.tsx` that future server-side roles can adopt without rework.
- **Distribution overview shape** — what the OF-8 distribution summary actually reports
  (fuel-on-hand by depot/type, in-transit buy orders, mobile truck fuel) and how it's visualized
  (panel table vs. map heat/markers).
- **Telemetry-request semantics** — does "request manual update" just flag the unit, open a
  manual-entry form, or post a request the scripted feed later "answers"? Keep it a clear stub if
  the answer source is out of scope.
