---
id: 60-never-stall-traversal-threat-crossing
title: Never-Stall Traversal + Safe/Fast Threat-Crossing
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-10
wave_status: active
depends_on: [14-sim-engine, 13-move-orders, 17-tile-cost-model, 43-routing-bug-fix]
relates: [44-terrain-router, 21-threat-planning-ui]
source_files:
  - backend/app/domain/move_order.py
  - backend/app/services/sim.py
  - backend/app/services/sim_runner.py
  - backend/app/providers/move_orders.py
  - backend/app/api/move_orders.py
  - frontend/src/api/types.ts
routes:
  - POST /api/v1/move-orders/{order_id}/proceed
models:
  - move_orders
test_files:
  - backend/tests/test_sim.py
  - backend/tests/test_move_orders.py
data_flow: .mdd/audits/flow-never-stall-traversal-threat-crossing-2026-06-03.md
last_synced: 2026-06-04
status: complete
phase: all
mdd_version: 11
tags: [routing, movement, sim, threat, move-orders, posture]
path: Sim/Engine
integration_contracts:
  - for: routing-mode-multi-route-ui
    function: "POST /api/v1/move-orders/{order_id}/proceed"
    when: "operator clicks 'Proceed slowly' on a halted unit"
  - for: routing-mode-multi-route-ui
    function: "halt banner + threat-L5 crossing warning (unit_update.status == 'halted'; route threat_max >= 5)"
    when: "a unit halts at an obstruction, or a planned route crosses a threat-level-5 cell"
satisfies_contracts:
  - from: 17-tile-cost-model
    function: "cost_model.tile_factors / edge_time_cost / safe_edge_cost"
    when: "deciding passable/block + crossing penalty from tile attributes in advance()/tick"
    status: done
    verified_at: "backend/app/services/sim_runner.py:230 (tile_factors), backend/app/services/sim.py:137 (factors.passable)"
  - from: 13-move-orders
    function: "move_orders.list_active / set_progress / set_status"
    when: "tick advances orders incl. crossing; halt sets status; proceed flips halted→crossing"
    status: done
    verified_at: "backend/app/services/sim_runner.py:243 (set_progress), backend/app/providers/move_orders.py:85 (list_active incl. CROSSING), backend/app/api/move_orders.py:113 (set_status→crossing)"
  - from: 14-sim-engine
    function: "WS /api/v1/ws unit_update messages"
    when: "tick keeps broadcasting unit_update (extended with halt reason)"
    status: done
    verified_at: "backend/app/services/sim_runner.py:256 (unit_update frame, +reason on halt)"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 60 — Never-Stall Traversal + Safe/Fast Threat-Crossing

## Purpose

A unit must **never freeze** mid-mission. Today a unit standing on a `BLOCKED` road makes zero
progress yet keeps burning fuel — a silent stall. This feature replaces that with a clean
**halt → inform → operator decides (proceed slowly / reroute)** model, and makes the existing
Fast/Safe route metrics behave as distinct **postures** for crossing threat. It is the engine
foundation for the rest of Wave 10 (the UI buttons live in F4).

## Architecture

The fix is in the **sim traversal**, not the planner (the W1 planner already always returns a
route; that route can still cross blocked tiles, which is where the sim froze).

```
sim_runner.tick(order)                      # order carries posture = order.metric (fast|safe)
  └─ look at the tile the unit is ENTERING this step (prospective next position → H3)
       ├─ passable, threat ≤ 4 ............... advance() normally
       ├─ threat L5, posture FAST ............ advance() at a THREAT penalty (crawl + extra fuel)
       ├─ threat L5, posture SAFE ............ HALT → cancel order → broadcast halt notice
       └─ physically BLOCKED (either posture)  HALT → cancel order → broadcast halt notice
  operator then either:
       ├─ POST /move-orders/{id}/proceed ..... order → CROSSING (crawl across at penalty; → ACTIVE once clear)
       └─ plans a new move order ............. normal reroute (Safe avoids it; F2 off-road later)
```

No DB migration: `move_orders.status` is a plain `varchar`, so new status strings cost nothing.
Posture (`metric`) and route `threat_max` already exist and are reused as-is.

## Data Model

`MoveOrderStatus` (StrEnum, `backend/app/domain/move_order.py`) gains two values:

| Status | Meaning |
|--------|---------|
| `pending` | created, awaiting confirmation *(existing)* |
| `active` | confirmed; the sim is advancing it *(existing)* |
| `complete` | unit arrived *(existing)* |
| `cancelled` | operator/ system cancelled *(existing)* |
| **`halted`** | **NEW** — stopped at an obstruction (block, or threat-L5 in Safe); awaiting operator |
| **`crossing`** | **NEW** — operator chose "proceed slowly"; crawling across the obstruction at a penalty |

No column change. `frontend/src/api/types.ts` `MoveOrderStatus` union extends to include
`'halted' | 'crossing'` (type-only; the UI that acts on them is F4).

Crossing penalties (tunable constants in `sim.py`, alongside the cost model):
- **physical block** → heavy crawl (e.g. `BLOCK_CROSS_SPEED_FACTOR ≈ 0.08`) + raised fuel factor
- **threat L5** → lighter crawl (e.g. `THREAT_CROSS_SPEED_FACTOR ≈ 0.4`) + modest fuel factor

## API Endpoints

### POST /api/v1/move-orders/{order_id}/proceed
Operator opts a **halted** order into "proceed slowly".
- **Auth:** none (single-user, server-authoritative — matches existing move-order routes).
- **Preconditions:** order exists and `status == halted`.
- **Effect:** `status → crossing`; the sim resumes advancing it, crawling across the obstructing
  tile at the penalty, then flips back to `active` once the unit is on a passable, threat-≤4 tile.
- **Response 200:** the updated `MoveOrder` (`status: "crossing"`).
- **Errors:** `404` if no such order; `409` if the order is not `halted`.

"Reroute" needs **no new endpoint** — the operator plans a fresh move order via the existing
`/routes/plan` + create-order flow. A `halted`/superseded order is left `cancelled`.

## Business Rules

1. **Never zero-progress-with-fuel-burn.** A unit is never left advancing 0 m while burning fuel.
   It is always doing one of: moving normally, crossing at a penalty (`crossing`), or `halted`
   (stopped, **no fuel burn**).
2. **Posture = `order.metric`.** `FAST` = shortest; auto-crosses threat-L5 at a penalty (the
   operator accepted the fast route, and it carries the L5 warning at plan time). `SAFE` =
   threat-weighted route; on encountering threat-L5 it halts and asks.
3. **A physical block always halts** (either posture). Physical block = `road_condition == BLOCKED`
   (`speed_factor == 0`, i.e. `tile_factors(...).passable is False`) **or** a manual obstacle cell.
   A block is never auto-crossed — only the operator's "proceed slowly" crosses it.
4. **Halt is terminal for the original order.** On halt: set `status = halted`, stop advancing,
   broadcast a notice. The order is not silently resumed; the operator decides.
5. **Crossing clears itself.** A `crossing` order advances at the penalty until the unit reaches a
   passable, threat-≤4 tile, then reverts to `active`. If a *new* block/L5 is met while `active`
   again, the halt rule re-applies.
6. **Threat-L5 = `threat_level >= 5`** on the 0–5 scale (requester's "over level 4"). The route's
   `threat_max >= 5` is the plan-time warning signal (surfaced by F4).
7. **Determinism.** All traversal decisions are pure functions of (order, tile, posture, dt,
   injected clock) — no wall-clock or RNG — so unit tests are deterministic.

## Data Flow

- `tile.road_condition` / `tile.threat_level` (0–5, `domain/tile.py`) → mutated by the tile/event
  feed → read in `sim_runner.tick` for the tile the unit is entering → drives halt/cross/normal.
- posture: chosen `RouteOption.metric` at plan time → persisted on `MoveOrderRow.metric` (already)
  → `MoveOrder.metric` → read in `tick` → passed to `advance()`.
- `advance()` returns a `SimStep` whose `status` may now be `HALTED`/`CROSSING`/`ACTIVE`/`COMPLETE`.
- `tick` persists status via the move-order provider and broadcasts a `unit_update` frame
  (adds `reason` + MGRS on halt) plus a chatter/strategic line on halt → frontend (F4 renders it).
- `threat_max` (`MAX(threat_level)` in the routing SQL) → `RoutePath`/`RouteOption` (already) →
  F4 reads `>= 5` for the crossing warning.

## Dependencies

- **14-sim-engine** — the tick/advance loop this feature modifies.
- **13-move-orders** — the order model + provider gaining `halted`/`crossing` + the proceed route.
- **17-tile-cost-model** — `tile_factors`, `BLOCKED`, threat weighting; penalty constants live here-adjacent.
- **43-routing-bug-fix** — the always-resolve planner whose routes the traversal consumes.

## Security

Server-authoritative, single-user. The new endpoint takes only a path `order_id` (no body);
validate it exists and is `halted` before mutating (409 otherwise). No external/user free-text
input, no new data storage beyond the status string, no process/network calls. Nothing to mask.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
