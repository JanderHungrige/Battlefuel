---
id: 123-scenario-force-placement
title: Scenario creator — place and remove blue and red forces
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-22
wave_status: active
depends_on: []
relates: [124-scenario-default-half-fuel, 125-opponents-removable, 127-scenario-save-load]
source_files:
  - backend/alembic/versions/0020_create_placed_enemy_units.py
  - backend/app/models/placed_enemy_unit.py
  - backend/app/providers/placed_enemy_units.py
  - backend/app/providers/unit_instances.py
  - backend/app/domain/enemy_unit.py
  - backend/app/services/force_placement.py
  - backend/app/api/unit_instances.py
  - backend/app/api/enemy_units.py
  - backend/app/services/routing_graph.py
  - frontend/src/lib/forceCatalog.ts
  - frontend/src/components/ForcePlacementPanel.tsx
  - frontend/src/api/client.ts
  - frontend/src/hooks/useTheaterData.ts
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes:
  - POST /api/v1/unit-instances
  - DELETE /api/v1/unit-instances/{instance_id}
  - POST /api/v1/enemy-units
  - DELETE /api/v1/enemy-units/{enemy_id}
models: [unit_instances, placed_enemy_units]
test_files:
  - backend/tests/test_force_placement.py
  - backend/tests/test_placed_forces.py
  - frontend/src/lib/forceCatalog.test.ts
  - frontend/src/components/ForcePlacementPanel.test.tsx
data_flow: mixed
last_synced: 2026-06-30
status: complete
phase: all
mdd_version: 11
tags: [scenario, force-placement, units, enemy-units, app6, of4]
path: Scenario/Placement
known_issues:
  - "Removal UX (revised after F1): clicking a placed force in placement mode SELECTS it (magenta halo) and a 'Delete unit' button on the panel removes it — no accidental click-to-delete. DELETE works for blue instances and DB-placed reds; the seeded OPFOR are also DB rows now (migration 0021) so they delete too (see [[125-opponents-removable]]). 204 No Content handling was fixed in sendJson."
  - "Placed/seeded reds feed SAFE routing + the W21 danger circles only after a re-annotation: annotate_ways runs on container boot, and annotate_cell on the next tile threat change — placing a red does not itself trigger a graph re-cost yet. Acceptable for a scenario-build step before play; a placement-time re-cost could be added later."
---

# 123 — Scenario force placement

## Purpose

The scenario creator's core: place and remove **blue and red** forces on the map, picking the unit
from a dropdown organised in two tabs — **fuel-related elements** vs **other troop elements**. Both
sides are persisted (server-authoritative) so a hand-built start survives reload and can be saved
([[127-scenario-save-load]]).

## Backend

- **Blue** are friendly `unit_instances` (already DB-backed). `UnitInstanceProvider` gains
  `create_instance` / `delete_instance`; `POST /unit-instances` (unit_type_id + point, optional name)
  and `DELETE /unit-instances/{id}`. New units start at **half fuel** ([[124-scenario-default-half-fuel]]).
- **Red** had no persistence (only an in-memory seed/chatter provider). New **`placed_enemy_units`**
  table (migration 0020) + `providers.placed_enemy_units` (list/create/delete); `POST /enemy-units`
  and `DELETE /enemy-units/{id}`. `GET /enemy-units` now **merges** the in-memory source with placed
  rows. A placed red is built from the **same unit-type catalog** as blue, with its SIDC flipped to
  hostile (`enemy_unit.to_hostile_sidc`, affiliation digit 3→6).
- **`services.force_placement`** is the factory-pattern entry point: `place_unit_instance` /
  `place_enemy_unit` turn a catalog `UnitType` + point into a concrete placement (id, H3, half fuel,
  hostile SIDC). Pure; persistence is the providers'.
- **Routing integration:** `routing_graph._default_enemies(session)` now returns the in-memory
  enemies **plus** placed reds, so SAFE cost and the Wave 21 danger circles avoid operator-placed
  hostiles (see known_issues for the re-annotation timing).

## Frontend

- **`lib/forceCatalog`** (pure): splits the unit-type catalog into the `fuel` tab (fuel_supply +
  logistics) and the `troops` tab (everything else).
- **`ForcePlacementPanel`**: side toggle (🟦 Blue / 🟥 Red), the two category tabs, and a unit-type
  dropdown; a hint tells the operator to click the map to place.
- **`App.tsx`**: a top-bar **Place forces** toggle (exclusive with obstacle / depot / draw / edit
  modes) opens the panel; `placeForce` / `removeForce` call the API and patch `units` / `enemyUnits`
  in place. **MapView** placement click: clicking an existing unit/hostile removes it, an empty point
  places the chosen force. `useTheaterData` now exposes `setEnemyUnits` for the in-place updates.

## Tests

- Backend `test_force_placement` (pure): SIDC flip, half-fuel, friendly/hostile builders, unique ids.
- Backend `test_placed_forces` (db): POST blue (half fuel) → listed → DELETE → gone → 404; same for
  red (hostile SIDC); unknown type → 404.
- Frontend `forceCatalog.test` (tab split) + `ForcePlacementPanel.test` (tab filtering, side/tab
  switches, selection, hint).

## Verification

Backend ruff + `mypy app` clean, pure + db tests green. Frontend 351 vitest + tsc + eslint + prod
build green. The end-to-end place/remove flow on the map is confirmed at the live `make dev` gate.
