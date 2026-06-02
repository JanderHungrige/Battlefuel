---
id: 43-routing-bug-fix
title: Routing Bug Fix — Reliable Resolve + Travel-Ordered Geometry
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-1
wave_status: active
depends_on: [11-routing-graph, 12-route-planning-api, 14-sim-engine, 17-tile-cost-model]
relates: [44-terrain-router]
source_files:
  - backend/app/providers/routing.py
  - backend/app/domain/route.py
  - backend/scripts/reset_road_conditions.py
routes: []
models:
  - ways
  - ways_vertices_pgr
test_files:
  - backend/tests/test_routing.py
data_flow: .mdd/audits/flow-routing-bug-fix-2026-06-02.md
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [routing, pgrouting, dijkstra, geometry-orientation, fallback, sim-pollution, threat-cost]
path: Routing/Engine
integration_contracts: []
satisfies_contracts: []
security_read_sites: []
known_issues: []
---

# 43 — Routing Bug Fix

## Purpose

Make the road router **reliably resolve** a route whenever the destination is geometrically
reachable, and **always return travel-ordered geometry** so the unit drives toward its
destination instead of reversing. Fixes the two live bugs — "never a route to that destination"
and units that "reverse / go back-and-forth / don't move" — at their single source,
`PgRoutingProvider.shortest_path`. Full root-cause evidence (reproduced against the live
sim-polluted DB) is in the data-flow audit linked above.

## Architecture

`shortest_path` is the only producer of route geometry; the planner display, the persisted
`MoveOrder`, and the live sim all consume `path.geometry`. Two changes, both inside the provider:

1. **Tiered routing (fixes "no route").** Run `pgr_dijkstra` first on the *primary* graph
   (metric cost `time_cost`/`safe_cost`, blocked edges and manual-obstacle cells excluded). If it
   returns no path, run a *fallback* over the *full* graph minimizing real `length_m`, excluding
   **only** manual obstacles. A route is returned whenever one geometrically exists; the path is
   flagged `degraded=True` and a warning is logged.
2. **Oriented geometry (fixes "reverse / back-and-forth").** Build the line by orienting each
   path edge to the traversal direction — `CASE WHEN ways.source = dijkstra.node THEN the_geom
   ELSE ST_Reverse(the_geom)` — then `ST_MakeLine(geom ORDER BY seq)`. Always a single,
   travel-ordered `start → dest` `LineString` (never a re-oriented `ST_LineMerge` result or an
   out-of-order flattened `MultiLineString`).

The aggregates clamp a blocked edge's `time_cost` (1e12 sentinel) down to its `length_m` so a
degraded route still reports a sane duration and fuel estimate.

## Data Model

No schema change. Reads `ways` (`source`, `target`, `the_geom`, `length_m`, `time_cost`,
`time_reverse_cost`, `safe_cost`, `safe_reverse_cost`, `cell_h3`) and `ways_vertices_pgr`;
joins `obstacles(h3_index)`. `reset_road_conditions.py` writes `tiles.road_condition` then
re-annotates `ways` via the existing `routing_graph.annotate_ways`.

`RoutePath` gains one optional field:

| field | type | default | meaning |
|-------|------|---------|---------|
| `degraded` | bool | `False` | route used the full-graph `length_m` fallback (primary metric graph had no path) |

## API Endpoints

None added. `shortest_path`'s signature is unchanged — callers (`route_planner.plan_routes`,
`move_order_service.create_move_order`) are untouched.

## Business Rules

- **Always-resolve invariant:** if start and destination snap to vertices in the same connected
  component of the *full* road graph (obstacles aside), `shortest_path` returns a `RoutePath`.
  It returns `None` only when no path exists even on the full graph (e.g. genuinely separate
  components, or start vertex == dest vertex).
- **Manual obstacles are absolute:** the fallback still excludes cells in `obstacles` (operator
  hard blocks), so it never routes through a deliberately blocked cell.
- **Orientation invariant:** `geometry[0]` is the start-vertex end and `geometry[-1]` the
  destination-vertex end, always, for both primary and fallback paths.
- **Degraded flag:** set iff the fallback produced the path.
- **Blocked-tile freeze is intentional and unchanged:** a unit on a `speed_factor==0` tile makes
  no progress (existing sim semantics). A degraded route may traverse such a tile as a last resort.

## Data Flow

See `.mdd/audits/flow-routing-bug-fix-2026-06-02.md`. Live reproduction: primary graph returned
**0 edges** (→ "no route") where the full graph returned a **20-edge** path; `ST_LineMerge`
orientation is not guaranteed travel-ordered, the oriented `ST_MakeLine` is.

## Dependencies

- `11-routing-graph` — the `ways` graph + annotation this fix queries.
- `12-route-planning-api` — `build_option`, the immediate consumer of geometry/aggregates.
- `14-sim-engine` — `advance()` consumes the stored geometry (verified correct; not modified).
- `17-tile-cost-model` — the `BLOCKED_COST` sentinel + cost columns this fix reasons about.

## Security

No external/untrusted input beyond already-validated lat/lon and `metric`. No new network calls,
processes, or storage. The reset script is an operator tool run manually against the dev DB.

## Known Issues

(none — surfacing the degraded flag in the UI is Wave 6; event-rate balance is Wave 4.)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
