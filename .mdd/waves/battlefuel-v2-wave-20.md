---
id: battlefuel-v2-wave-20
title: "Wave 20: Routing graph visibility + manual road/path drawing"
initiative: battlefuel-v2
initiative_version: 11
status: planned
depends_on: battlefuel-v2-wave-18
demo_state: "The operator can see and extend the routing graph. A top-row checkbox overlays the underlying graph network (nodes + edges) so the routing calculations are understandable. In OF-4, 'Add road' and 'Add path' buttons let the user draw a new road (solid, for road routing) or path (dotted, for off-road) onto the map; a panel offers 'remove last waypoint' and 'stop draw road/path'. On stop, a popup asks whether to connect the first, last, both, or no endpoints to the closest graph point with a straight line — and the drawn geometry then becomes part of the routing graph so routes can use it."
created: 2026-06-26
hash: 465ed315
---

# Wave 20: Routing graph visibility + manual road/path drawing

> **Requested 2026-06-26 (brain-dump batch).** Two related operator tools: see the graph the
> router uses, and hand-author new roads/paths into it. (Hand-drawn passage editing was descoped
> from Wave 10 F6 to TODO — this wave delivers the full version.)

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — on `dev-deployment`, deployed to `:3001`, verified
- [ ] **merged into main / deployed in prod** — in `main`, live `:3000`

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | routing-graph-overlay-api | — | planned | — |
| 2 | graph-network-toggle | — | planned | routing-graph-overlay-api |
| 3 | draw-road-path-tool | [115](../docs/115-draw-road-path-tool.md) | complete | — |
| 4 | connect-drawn-to-graph | [116](../docs/116-connect-drawn-to-graph.md) | complete | draw-road-path-tool, routing-graph-overlay-api |

Build order: 1 → 2; 3 → 4 (4 also needs 1's vertex data).

### Current state (code investigation 2026-06-26)
- **Graph lives in `ways` + `ways_vertices_pgr`** (osm2pgrouting), annotated by
  `services/routing_graph.py` with `time_cost`/`safe_cost`/`cell_h3`. No endpoint exposes the
  raw nodes/edges to the frontend yet.
- **Hand-drawn passage was descoped** (Wave 10 F6 → TODO.md, "pgRouting ways-graph edge
  injection, future routing-data wave") — this wave is that follow-up.

### Feature notes (requester 2026-06-26)
- **F1 routing-graph-overlay-api** — backend endpoint serving the graph as GeoJSON: edges from
  `ways` (optionally with cost/threat for styling) and nodes from `ways_vertices_pgr`, bounded to
  the theater. Versioned under `/api/v1/`.
- **F2 graph-network-toggle** — a checkbox on the top row that overlays nodes + edges on the map
  (MapLibre source updated imperatively per the established once-init pattern); off by default.
- **F3 draw-road-path-tool** — OF-4 "Add road" and "Add path" buttons. Entering a draw mode opens
  a panel with **remove last waypoint** and **stop draw road/path**; clicks drop waypoints; the
  road draws **solid**, the path draws **dotted**. Esc exits the mode (consistent with W10).
- **F4 connect-drawn-to-graph** — on "stop draw road/path" show a popup to connect the **first,
  last, both, or none** of the drawn endpoints to the closest graph vertex with a straight line;
  apply the choice, then inject the drawn line (plus any connectors) into the `ways` graph as new
  edges (road = road-routable; path = off-road/track), re-annotate the affected cell(s) so the new
  geometry is immediately routable.

## Open Research (resolve at plan-time)
- Edge injection mechanics: insert into `ways` with new `ways_vertices_pgr` nodes + topology
  (`pgr_createTopology` or manual source/target wiring), set `length_m` + annotate via the cost
  model; how to persist operator-authored edges across reseeds (separate table vs flag on `ways`).
- Overlay performance/legibility at theater zoom (decluttering nodes; LOD).
- Path (off-road) edges: how a drawn track interacts with the terrain/off-road router vs the road
  `ways` graph.
