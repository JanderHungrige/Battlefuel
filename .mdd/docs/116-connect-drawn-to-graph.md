---
id: 116-connect-drawn-to-graph
title: Connect drawn road / path to the routing graph
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-20
wave_status: active
depends_on: [115-draw-road-path-tool, 113-routing-graph-overlay-api]
relates: [115-draw-road-path-tool, 113-routing-graph-overlay-api, 11-routing-graph]
source_files:
  - backend/app/models/drawn_edge.py
  - backend/app/domain/drawn_edge.py
  - backend/app/providers/drawn_edges.py
  - backend/app/services/drawn_graph.py
  - backend/app/api/drawn_edges.py
  - backend/app/config.py
  - backend/app/main.py
  - backend/scripts/startup_data.py
  - backend/scripts/annotate_routing.py
  - backend/alembic/versions/0019_create_drawn_edges.py
  - frontend/src/components/ConnectGraphPopup.tsx
  - frontend/src/hooks/useRoutingGraph.ts
  - frontend/src/api/client.ts
  - frontend/src/api/types.ts
  - frontend/src/App.tsx
routes: ["/api/v1/drawn-edges"]
models: ["drawn_edges"]
test_files:
  - backend/tests/test_drawn_graph.py
  - frontend/src/components/ConnectGraphPopup.test.tsx
data_flow: reads-existing
last_synced: 2026-06-29
status: complete
phase: all
mdd_version: 11
tags: [routing, graph, pgrouting, drawn-edge, injection, ways, of4]
path: Routing/Graph
integration_contracts: []
satisfies_contracts: []
security_read_sites: []
known_issues:
  - "Injection sets a drawn edge's cost columns directly (road vs penalised track). A later targeted re-cost on a threat event (`annotate_cell`) recomputes that cell's edges from the tile's road_condition, so a drawn *path* in that cell would be re-costed as a road until the next full reseed re-injects it. Acceptable for the demo; revisit if drawn paths need threat-event re-cost to preserve the track penalty."
  - "The ConnectGraphPopup + overlay refresh are verified at the live make dev gate (jsdom mocks MapView); the popup wiring is unit-tested and the injection is integration-verified end-to-end (POST -> 3 ways rows -> DELETE clean) against the live PostGIS graph."
---

# 116 — Connect drawn road / path to the routing graph

## Purpose

Turn an operator-drawn line ([[115-draw-road-path-tool]]) into a routable edge of the pgRouting
`ways` graph. On **Stop**, a popup asks whether to connect the **first / last / both / none** of the
line's endpoints to the nearest existing graph vertex with a straight connector; the line (plus any
connectors) is then injected into `ways` / `ways_vertices_pgr` so all routers can use it
immediately. Drawn edges persist in their own table and are **re-injected after every reseed**.

## Architecture

```
operator Stop → ConnectGraphPopup (first/last/both/none)
   → POST /api/v1/drawn-edges {kind, coordinates, connect}
      → DrawnEdgeRow persisted (drawn_edges table)
      → inject_drawn_edges(session): rebuild all drawn ways/vertices
         → overlay reload (graphReload bump) shows the new edge
reseed (osm2pgrouting --clean wipes ways) → annotate_ways → inject_drawn_edges re-adds drawn edges
```

- **`drawn_edges` table / `DrawnEdgeRow`** — persistent operator-authored edges (mirrors
  `obstacles`): `id`, `kind` (`road`|`path`), `coordinates` (JSONB `[lon,lat][]`), `connect_start`,
  `connect_end`, `created_at`.
- **`drawn_graph.py` service** — `inject_drawn_edges(session)` is idempotent: it ensures a `drawn_id`
  marker column on `ways` / `ways_vertices_pgr`, **deletes all prior `drawn_id` rows**, then re-adds
  every `DrawnEdgeRow` as: two new vertices (start/end), the drawn LineString as one edge, and a
  straight connector edge per chosen endpoint to its nearest existing (`drawn_id IS NULL`) vertex.
  Costs come from the shared `cost_model`: a **road** edge is costed like a clear road
  (`time_cost = length_m`); a **path** is a track (`time_cost = length_m / OFFROAD_STUB_SPEED_FACTOR`,
  `fuel_factor = OFFROAD_FUEL_PENALTY`). Pure helpers (`edge_cost_params`, `line_length_m`,
  `connect_flags`, `linestring_geojson`) are unit-tested.
- **Provider + factory** — `DrawnEdgeProvider` / `DbDrawnEdgeProvider`, `drawn_edge_provider="db"`.
- **API** — `POST /drawn-edges` (persist → inject), `GET /drawn-edges`, `DELETE /drawn-edges/{id}`
  (delete → re-inject). Under `/api/v1`.
- **Reseed hook** — `inject_drawn_edges` runs after `annotate_ways` in `startup_data.py` and
  `annotate_routing.py`, so drawn edges survive `osm2pgrouting --clean`.
- **Frontend** — `ConnectGraphPopup` (first/last/both/none + cancel) shown on `draw.finished`;
  `api.createDrawnEdge`; `useRoutingGraph(enabled, reloadToken)` gains a reload token so the overlay
  refetches and shows the injected edge.

## Data Model

`drawn_edges`: `id` (str pk), `kind` (str), `coordinates` (JSONB — `[lon,lat]` pairs, ≥2),
`connect_start` (bool), `connect_end` (bool), `created_at` (timestamp). New columns on the
osm2pgrouting tables: `ways.drawn_id` / `ways_vertices_pgr.drawn_id` (nullable text — NULL = base
OSM, set = injected; the idempotent delete/re-insert key).

## API Endpoints

- `POST /api/v1/drawn-edges` — body `{ kind: 'road'|'path', coordinates: [lon,lat][] (≥2), connect:
  'first'|'last'|'both'|'none' }` → `201 DrawnEdge`. Persists then injects.
- `GET /api/v1/drawn-edges` → `DrawnEdge[]`.
- `DELETE /api/v1/drawn-edges/{id}` → `{ id, status }`; re-injects the remaining edges.

## Business Rules

- `connect` maps to flags: `first`→start only, `last`→end only, `both`→both, `none`→neither.
- A connector bridges a drawn endpoint to its **nearest existing graph vertex**; with `none` the
  drawn edge is isolated (drawable + visible but not reachable until connected).
- Injection is **delete-all-drawn then re-add-all** — the `drawn_edges` table is the single source
  of truth, so POST/DELETE and reseed all converge on the same graph state.
- A **road** is a normal road edge; a **path** is a penalised track (slower + thirstier), so SAFE/
  FAST routing treats it as off-road-grade but still usable.

## Data Flow

Reads existing `tiles.threat_level` (edge threat at the midpoint cell, for `safe_cost`) and
`ways_vertices_pgr` (nearest vertex for connectors). Writes `drawn_edges` (+ injected `ways` /
`ways_vertices_pgr` rows). The cost columns reuse the Wave-4 `cost_model` so plan/sim estimates stay
consistent.

## Dependencies

- [[115-draw-road-path-tool]] — supplies the finished `{ kind, points }` line.
- [[113-routing-graph-overlay-api]] — the overlay that visualises the injected edge (reload token).

## Security

`POST /drawn-edges` accepts **untrusted operator input**. Trust boundary:
- `kind` is a `Literal['road','path']`; `connect` a `Literal` of the four choices — non-members
  rejected by Pydantic.
- `coordinates` are validated floats (lat ∈ [-90,90], lon ∈ [-180,180], ≥2 pairs of length 2). They
  are **never string-interpolated into SQL** — geometry is built via `ST_GeomFromGeoJSON(:gj)` with a
  bound JSON parameter and `ST_MakePoint(:lon,:lat)` with bound floats. The injected SQL uses only
  parameterised statements.
- The endpoint writes to the `drawn_edges` table and the routing graph only; it exposes no
  filesystem, env, or credential surface.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
