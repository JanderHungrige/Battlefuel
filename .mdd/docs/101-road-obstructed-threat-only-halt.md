---
id: 101-road-obstructed-threat-only-halt
title: Road "obstructed" (passable) + threat-only halt popup
edition: MDD
initiative: battlefuel-v2
status: planned
phase: all
mdd_version: 11
tags: [routing, halt, road-condition, cost-model, threat, rename]
path: Routing/Halt
---

# 101 — Road "obstructed" (passable) + threat-only halt popup

## Context / problem
A blocked-road tile is currently **impassable** (`ROAD_SPEED[BLOCKED] = 0.0` → `passable = False`),
which (a) makes SAFE routing look bad (hard-avoid / odd detours, sentinel cost `1e12`) and (b) makes
the unit **halt** on entry with reason `"blocked"` — a popup that fires on level-3/4 tiles whenever a
catalog event blocked the road (e.g. "Road/bridge destroyed" = threat 4 + blocked). To the user that
reads as an inconsistent, threat-unrelated popup. Fix: make blocked roads a **passable crawl** renamed
**"obstructed"**, and make the **halt popup fire only on threat**.

## Branch
New branch off `feat/unify-threat-chatter` (it has the unify work + the `dev.sh` fix not yet in main),
e.g. `feat/road-obstructed-threat-only-halt`. Backend migration → auto-runs on deploy; **no reseed**.

---

## Change A — obstructed roads are a passable crawl (not impassable)
`backend/app/services/cost_model.py`:
- `ROAD_SPEED[OBSTRUCTED] = 0.15` (was `BLOCKED: 0.0`) — slower than `DAMAGED`, but > 0 so
  `passable` is **True**. Keep `ROAD_FUEL` heavy. Tunable.
- Keep `BLOCKED_COST` / the `passable` property: they still serve genuinely **impassable terrain**
  (water = `TERRAIN_SPEED 0`). Only the road key changes.
- `backend/app/providers/routing.py` (line ~144): the `road_condition → cost` map entry
  `"blocked": _BLOCKED_COST` must become `"obstructed": <finite>` so the routing graph treats it as
  high-but-finite (routes may crawl through), not excluded. (`_BLOCKED_COST` stays for water/obstacle
  filter.)

Effect: routing uses obstructed roads as a last resort (no hard-avoid), units crawl through, and
`passable` is True → **no road halt** (this is most of Change C).

## Change B — rename `RoadCondition.BLOCKED` → `OBSTRUCTED` ("obstructed")
This is a value rename (stored in `tiles.road_condition`), so it needs a migration. Surface:
- **Backend:** `domain/tile.py` (`BLOCKED = "blocked"` → `OBSTRUCTED = "obstructed"`),
  `services/cost_model.py` (ROAD_SPEED/ROAD_FUEL keys), `services/event_engine.py` (`road_for_event`
  returns `RoadCondition.OBSTRUCTED`), `providers/routing.py` (the `"blocked"` cost-map key + the
  "blocked roads" comment), doc comments in `routing_graph.py`.
- **Alembic migration 0018:** `UPDATE tiles SET road_condition='obstructed' WHERE road_condition='blocked'`.
- **Frontend:** `api/types.ts` (`road_condition: 'clear'|'damaged'|'obstructed'`),
  `map/cellSituation.ts` (`ROAD_BY_RANK` + type comment), `components/InspectPanel.tsx` (the CellEdit
  `<option value="obstructed">obstructed</option>`), `lib/obstacleCatalog.ts` (the 3
  `road_condition: 'blocked'` template mutations).
- **Tests:** `cellSituation.test.ts`, `obstacleCatalog.test.ts`, plus the halt tests (Change C).
- **Leave as-is:** the obstacle kind `'roadblock'` (an obstacle *type*, not a road condition) and the
  routing sentinel name `BLOCKED_COST`/`_BLOCKED_COST` (it's "impassable cost", unrelated) — or
  optionally rename the sentinel to `IMPASSABLE_COST` for clarity. Decide at impl time.

## Change C — halt popup only on threat
With Change A, obstructed roads are passable → the `not factors.passable` branch no longer fires for
them. Remaining work to make the popup strictly threat-only while keeping the Wave-10 never-stall
safety for truly-impassable terrain:
- `backend/app/services/sim.py` (`blocked = not factors.passable`) + `sim_runner.py` (line ~398,
  `reason = "blocked" if not passable else "threat"`): keep the not-passable halt as a **silent
  never-stall safety** (so a unit ordered onto water halts cleanly, not frozen), but rename its reason
  to `"impassable"` (distinct from the user popup).
- **Frontend:** the HaltBanner popup shows **only** when `reason === 'threat'`. Update
  `lib/halt.ts` (reason union → `'threat' | 'impassable'`, default `'threat'`), `App.tsx`
  (`firstHaltedUnit`/banner gating to threat), `components/HaltBanner.tsx` copy (drop "blocked sector"
  wording), and `HaltBanner.test.tsx` / `halt.test.ts`.

## Verification
- Backend: `ROAD_SPEED[OBSTRUCTED] > 0` → `tile_factors(...).passable` True; a unit crossing an
  obstructed tile gets a CROSSING/slow step (not HALTED); the threat-5 halt still fires. Migration
  flips existing `blocked` rows. ruff + mypy + pytest.
- Frontend: obstructed renders/labels; the halt banner appears for threat, not for obstructed roads.
  tsc + eslint + vitest + build.
- Live (`make dev`, now deployed-equivalent): drive a unit through an obstructed (ex-"road destroyed")
  tile → it crawls, **no popup**; drive into a threat-5 tile → popup. Then dev `:3001` → prod `:3000`.

## Not in scope (separate follow-up)
The threat-5 halt can still be a "surprise" because the routing graph is a snapshot — that's the
**W17 live re-cost** (call `annotate_cell` on threat/road change in `apply_tile_mutation` callers).
Obstructed-road staleness stops mattering after Change A (it no longer halts, only slows).
