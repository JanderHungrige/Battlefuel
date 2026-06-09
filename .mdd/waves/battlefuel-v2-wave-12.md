---
id: battlefuel-v2-wave-12
title: "Wave 12: Fuel Run — routed refuel"
initiative: battlefuel-v2
initiative_version: 6
status: complete
depends_on: battlefuel-v2-wave-11
demo_state: "In OF-8 the operator runs a 'fuel run'. Truck-first: click a fuel truck → Create fuel run → click the target unit on the map → the engine computes Safe + Fast routes → the operator picks one and confirms → the truck routes to the unit and fuel transfers on arrival (co-location). Unit-first: click a unit → Refuel → the engine finds the closest fuel source (mobile truck or fixed depot) and computes Safe/Fast routes → on confirm the truck routes to the unit and transfers; BUT if the closest source is a fixed depot, the unit routes to the depot instead and fills from the depot's stock (which is decremented). Reuses the Wave-10 Safe/Fast routing + never-stall movement and the co-location transfer."
created: 2026-06-06
hash: 72ddc302
---

# Wave 12: Fuel Run — routed refuel

> **Immediate follow-on to Wave 11 (requester, 2026-06-06).** Turns the OF-8 refuel from a
> manual "recommend a truck, you move it yourself" step into a routed **fuel run**: the engine
> plans Safe/Fast routes and, on confirm, dispatches the mover and transfers fuel on arrival.

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [x] **tested local** — `make dev`, demoed on localhost
- [x] **tested online** — on `dev-deployment`, deployed to `:3001`, verified
- [x] **merged into main / deployed in prod** — in `main` (prod merge `7195a07`), live `:3000`

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | routed-fuel-run | docs/74-routed-fuel-run.md | complete | — |
| 2 | depot-source-fuel-run | docs/75-depot-source-fuel-run.md | complete | routed-fuel-run |

Build order: 1 → 2.

### Feature notes (requester 2026-06-06)
- **F1 routed-fuel-run** — integrate refuel with routing. **Truck-first:** click a fuel truck →
  "Create fuel run" → click the target unit on the map → compute Safe + Fast routes (Wave-10
  engine) → operator picks one → confirm → the truck gets a move order to the unit AND a refuel
  order is created so the existing co-location transfer fires on arrival. **Unit-first:** click a
  unit → "Refuel" → find the **closest mobile fuel truck** → compute Safe/Fast routes → confirm →
  truck routes to the unit + transfers. Source is a **mobile truck** in F1 (mover = truck → unit).
  Reuse: `/routes/plan` (Safe/Fast), `create_move_order` (any instance), `try_complete_refuel`
  (co-location). New: an explicit-truck option on `create_refuel_order`, and a `fuel-runs`
  endpoint that creates + activates the move order + refuel order together.
- **F2 depot-source-fuel-run** — the unit-first "closest source" search also considers **fixed
  depots**. If the closest source is a **depot**, the **unit routes to the depot** (depots can't
  move) and fills from the depot's `FuelStock` on arrival — **draining that stock** (reuse
  `adjust_stock`; a low depot then triggers the Wave-11 low-site proposal). Needs a depot-sourced
  refuel order (RefuelOrder gains an optional `depot_id`, `truck_id` becomes optional) + a sim
  depot-transfer hook alongside `complete_refuels`.

## Open Research (resolved at plan-time, requester 2026-06-06)
- **Depot transfer** → drain the depot's stock into the unit on arrival (decided).
- **Approach** → new Wave 12 on its own branch off the Wave-11 tip (decided).
