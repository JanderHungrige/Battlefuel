---
id: 89-threat-halt-popup-fix
title: Threat-Halt Popup Fix — fire on reaching threat, Continue button, slow-mode fuel
edition: MDD
depends_on: [14-sim-engine, 13-move-orders]
relates: [85-rendezvous-routing]
source_files:
  - backend/app/domain/move_order.py
  - backend/app/services/sim.py
  - backend/app/services/sim_runner.py
  - backend/app/api/move_orders.py
  - frontend/src/api/types.ts
  - frontend/src/api/client.ts
  - frontend/src/lib/halt.ts
  - frontend/src/components/HaltBanner.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/move-orders/{order_id}/continue
test_files:
  - backend/tests/test_sim.py
  - frontend/src/lib/halt.test.ts
  - frontend/src/components/HaltBanner.test.tsx
data_flow: greenfield
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [halt, threat, sim, move-orders, fuel, of-4]
path: Movement/Halt
integration_contracts: []
satisfies_contracts: []
known_issues: []
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 89 — Threat-Halt Popup Fix

## Purpose

Fixes the Wave-10 threat-halt UX. **Bug:** an ACTIVE unit in SAFE posture halted on the *first*
sub-step of a move whenever it **started in** a threat tile (the look-ahead's "entering" tile was
that same threat tile), so the halt popup fired at move start. **Fix:** halt only on the
**transition** into a threat tile (clean → threat); never when the unit is already in threat.
Adds a **Continue** (normal-speed cross) option beside "Proceed slowly", and surfaces the
**adjusted slow-mode fuel** estimate over the remaining threat tiles on the route.

## Architecture

- **Halt only on transition (backend, `sim.py` + `sim_runner.py`).** `advance_with_terrain` gains
  `currently_in_threat`. The sim passes the unit's **current** tile threat; an ACTIVE/SAFE unit
  entering a threat-L5 tile halts **only if it is not already in threat**. A unit that started in
  (or is moving through) a threat tile proceeds at normal speed — no popup.
- **Continue at normal speed (new `MoveOrderStatus.CONTINUING`).** After a halt the operator can
  **Continue** (cross the current threat tile at normal speed) or **Proceed slowly** (the existing
  `CROSSING` crawl at the 1.2× fuel / 0.4× speed penalty). Both revert to ACTIVE once the unit
  clears the tile, so the **next** threat tile en route raises a fresh decision. `CONTINUING` is a
  plain string status (no migration). New endpoint `POST /move-orders/{id}/continue` (halted →
  continuing), mirroring `/proceed` (halted → crossing).
- **Slow-mode fuel estimate (backend).** On a halt the sim samples the remaining route at the grid
  step, sums the fuel to crawl the remaining threat tiles at the crawl penalty, and includes
  `slow_mode_fuel_l` in the halt `unit_update` frame. The HaltBanner shows it next to "Proceed
  slowly".

## Business Rules

- No popup if the unit starts in / is already inside a threat tile; popup fires when it **reaches**
  a (new) threat tile en route.
- Physical blocks still halt on entry (unchanged) — Continue/Proceed both crawl a block, since it
  cannot be crossed at normal speed.
- Only a `halted` order may Continue or Proceed (409 otherwise).

## Data Flow

`unit_update` halt frame gains `slow_mode_fuel_l` (estimated adjusted fuel over remaining threat
tiles). `HaltedUnit` carries it to the banner. Greenfield otherwise.

## Dependencies

- **14-sim-engine** — the tick loop / look-ahead halt path being fixed.
- **13-move-orders** — the move-order status model + the `/proceed` endpoint mirrored by `/continue`.

## Security

Server-authoritative; no external callers. No secrets.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
