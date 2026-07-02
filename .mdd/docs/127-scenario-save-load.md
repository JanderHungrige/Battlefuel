---
id: 127-scenario-save-load
title: Save and reload hand-built scenarios by name
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-22
wave_status: active
depends_on: [123-scenario-force-placement]
relates: [123-scenario-force-placement, 126-multi-tile-threat-select]
source_files:
  - backend/alembic/versions/0022_create_scenarios.py
  - backend/app/models/scenario.py
  - backend/app/domain/scenario.py
  - backend/app/services/scenario_service.py
  - backend/app/api/scenarios.py
  - backend/app/main.py
  - frontend/src/api/client.ts
  - frontend/src/api/types.ts
  - frontend/src/components/ScenarioPanel.tsx
  - frontend/src/hooks/useScenarios.ts
  - frontend/src/App.tsx
routes:
  - GET /api/v1/scenarios
  - POST /api/v1/scenarios
  - POST /api/v1/scenarios/{scenario_id}/load
  - DELETE /api/v1/scenarios/{scenario_id}
models: [scenarios]
test_files:
  - backend/tests/test_scenario_service.py
  - frontend/src/components/ScenarioPanel.test.tsx
data_flow: mixed
last_synced: 2026-07-02
status: complete
phase: all
mdd_version: 11
tags: [scenario, save-load, persistence, snapshot, of4]
path: Scenario/SaveLoad
known_issues:
  - "Load replaces the whole world (deletes units/enemies/depots/obstacles + in-flight orders, resets tile threats) and re-annotates the routing graph, then the frontend does a full page reload to re-bootstrap every hook. Ids are regenerated on load, so it is a fresh START state, not a resume. The sim clock keeps running."
  - "The snapshot captures operator/ambient tile threat (threat_level) but not per-tile located events (last_event); loading clears last_event. Event-driven threats are transient sim state, not part of a hand-built scenario."
---

# 127 — Scenario save/load

## Purpose

Close the scenario creator: **save the full hand-built state under a name and reload it later**
(server-authoritative). A saved scenario captures blue + red forces, depots (with per-fuel stock),
tile threats, and obstacles — everything the creator ([[123-scenario-force-placement]],
[[126-multi-tile-threat-select]]) produces.

## Backend

- **`scenarios` table** (migration 0022): `id`, unique `name`, JSONB `snapshot`, `created_at`.
- **`domain/scenario.py`** — `ScenarioSnapshot` (units / enemies / depots+stocks / threats /
  obstacles) + `ScenarioSummary`. Source-agnostic serialisable shape.
- **`services/scenario_service.py`**:
  - `build_snapshot` reads the current state from each table into a snapshot.
  - `restore_snapshot` clears the live state (forces, depots, obstacles, in-flight orders; resets
    tile threats), rebuilds from the snapshot (new ids), then **re-annotates the routing graph** so
    SAFE cost + the Wave 21 danger reflect the loaded threats/enemies.
  - `save_scenario` (upsert by name), `list_scenarios`, `load_scenario`, `delete_scenario`.
- **`api/scenarios.py`** — `GET/POST /scenarios`, `POST /scenarios/{id}/load`, `DELETE /scenarios/{id}`;
  registered in `main.py`. Load also broadcasts a `scenario_loaded` frame (harmless to clients that
  ignore it).

## Frontend

- **`ScenarioPanel`** (topbar **Scenarios** toggle): a name field + **Save current**, and a list of
  saved scenarios with **Load** / delete. **`useScenarios`** fetches the list while the panel is open
  and refetches after save/delete.
- **`App`**: save → `POST /scenarios` + refetch; delete → `DELETE` + refetch; **load → `POST
  …/load` then `window.location.reload()`** to re-bootstrap every hook cleanly (a scenario replaces
  the whole world).

## Tests

- `test_scenario_service` (db) — save → list → **load roundtrip** (restored unit/threat counts match
  the snapshot) → unknown-id load is False → delete.
- `ScenarioPanel.test` — empty state, Save disabled until a non-blank name, trimmed-name save, list
  with load + delete wiring.

## Verification

Backend ruff + `mypy app` clean; scenario routes registered; 295 non-db + the db roundtrip green
(migration 0022 applied locally). Frontend 369 vitest + tsc + eslint + prod build green. The full
save → reload flow is confirmed at the live `make dev` gate.
