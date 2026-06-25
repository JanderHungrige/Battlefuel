---
id: 102-live-graph-recost-coverage
title: Live routing-graph re-cost — close the coverage gap
edition: MDD
initiative: battlefuel-v2
status: planned
phase: all
mdd_version: 11
tags: [routing, annotate_cell, cost-graph, threat, live-recost]
path: Routing/LiveRecost
---

# 102 — Live routing-graph re-cost: close the coverage gap

## Context (corrected understanding)
The live per-cell re-cost is **already wired**: `services/tile_mutation.py::apply_tile_mutation`
calls `routing_graph.annotate_cell(session, h3_index)` after every tile change, and all live
mutations go through it — the EventEngine (fire / revert / decay) and the operator `PATCH /tiles/{h3}`.
So the earlier "the graph is a snapshot, never updated live" framing was wrong: only the **startup**
`annotate_ways` is a full snapshot; individual tile changes do re-cost their cell.

**But** an audit of the live DB found **blocked/obstructed tiles whose `ways` edges were still cheap**
(routes planned straight through them). So `annotate_cell` is not fully keeping the graph in sync —
there is a **coverage gap**, not a missing feature.

## Likely root causes (to confirm first)
`annotate_cell` re-costs only `ways WHERE cell_h3 = :h` — edges assigned to the mutated cell by the
`cell_h3` column (populated by `annotate_ways`, by the edge **midpoint's** cell).
1. **Edge-to-cell assignment is by midpoint.** A road edge that *passes through* the mutated tile but
   whose midpoint lands in a **neighbouring** cell is not re-costed → a route still treats the edge
   through the now-obstructed/threatened tile as cheap. Most likely the gap.
2. **`cell_h3` NULL / unpopulated** for some edges (only set during a full `annotate_ways`) → those
   edges are never targeted by `annotate_cell`.
3. **Silent failure in the sim loop.** `sim_runner._run` wraps the tick in `except Exception: pass`,
   so if an `annotate_cell` call raises, the tile mutation has already committed but the re-cost is
   lost — with no log.
4. **Enemy boost drift:** `annotate_cell` rebuilds the enemy list each call (fine), but enemies are a
   static provider; if they ever move, cells near them go stale (note, don't fix).

## Plan
1. **Confirm the gap (read-only).** For a sample of obstructed/threat-5 tiles, compare
   `tiles.road_condition/threat_level` to the cost of every `ways` edge that geometrically intersects
   the cell (not just `cell_h3 = h3`). Quantify how many edges-through-cell are missed by the
   midpoint assignment.
2. **Fix coverage.** Make `annotate_cell` re-cost every edge that *touches* the cell, not just those
   whose midpoint is in it — e.g. re-cost `cell_h3 IN (h3 + k-ring(1))`, or switch the targeting to a
   spatial `ST_Intersects` against the cell boundary. Keep it cheap (a handful of edges per call).
3. **Make failures visible.** Wrap the per-tick `annotate_cell` so an error is logged (not silently
   swallowed by the sim loop), and consider a periodic (every N ticks) full `annotate_ways` as a
   cheap safety net that heals any drift.
4. **Verify.** Backend test: mutate a tile to obstructed/threat-5 via `apply_tile_mutation`, then
   assert **every** `ways` edge intersecting that cell has the impassable / threat-weighted cost
   (currently only the midpoint-assigned ones do). Live `make dev`: block a tile on a unit's planned
   route → the SAFE re-plan routes around it (or crawls), no stale straight-through.

## Notes
- Doc 101 (obstructed = passable crawl) already makes a stale obstructed edge merely *slow* rather
  than a surprise halt, so this is now about routing *quality*, not the halt popup.
- `annotate_cell`'s signature already accepts `enemies`; `apply_tile_mutation` passes none (rebuilt
  inside). Fine for static enemies.
