---
id: 125-opponents-removable
title: Opponents (red forces) are removable — including the seeded OPFOR
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-22
wave_status: active
depends_on: [123-scenario-force-placement]
relates: [123-scenario-force-placement]
source_files:
  - backend/alembic/versions/0021_seed_placed_opfor.py
  - backend/app/config.py
  - frontend/src/components/ForcePlacementPanel.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
  - frontend/src/api/client.ts
routes: []
models: [placed_enemy_units]
test_files:
  - backend/tests/test_enemy_units.py
  - backend/tests/test_placed_forces.py
  - frontend/src/components/ForcePlacementPanel.test.tsx
data_flow: writes-existing
last_synced: 2026-06-30
status: complete
phase: all
mdd_version: 11
tags: [scenario, enemy-units, remove, opfor, of4]
path: Scenario/Placement
known_issues:
  - "Removal is surfaced through the scenario creator's Place forces panel (select a force → magenta halo → Delete unit), which is the red-edit surface; there is no separate remove affordance during normal play. Add one if needed."
  - "The default in-memory enemy_unit_provider is now 'none' (config). If a deployment overrides BATTLEFUEL_ENEMY_UNIT_PROVIDER=seed, the in-memory seed would re-add the 3 OPFOR on top of the DB rows (duplicate ids; GET dedupes by id, routing's max is idempotent, but deleting one would let the in-memory copy reappear). Leave it unset / 'none'."
---

# 125 — Opponents removable

## Purpose

Make red forces deletable — **including the demo OPFOR** that previously lived only in the in-memory
`SeededEnemyUnitProvider` (and so could not be removed). The scenario creator
([[123-scenario-force-placement]]) can now clear and rebuild the whole hostile picture, not just the
units it placed itself.

## Change

- **Seeded OPFOR → DB.** Migration **0021** inserts the three demo OPFOR (same ids / SIDCs / positions
  as the old in-memory seed) into `placed_enemy_units`. The default `enemy_unit_provider` is switched
  to **`none`** so the in-memory seed no longer re-supplies them — otherwise a deleted OPFOR would
  reappear. `GET /enemy-units` already merges (and dedupes) the in-memory source with the DB rows, and
  routing's `_default_enemies` reads the DB, so the on-map picture and SAFE-cost danger are unchanged
  — except every red is now a removable DB row.
- **Removal UX** (shared with the F1 placement rework): in **Place forces** mode, clicking any force
  selects it (magenta halo); the panel's **Delete unit** button calls `DELETE /enemy-units/{id}` (red)
  or `DELETE /unit-instances/{id}` (blue) and drops it from the map. The seeded OPFOR delete exactly
  like operator-placed reds.

## Tests

- `test_enemy_units` (db) — `GET /enemy-units` lists the seeded OPFOR (now from the DB) by id, hostile.
- `test_placed_forces` (db) — place/list/delete/404 for a red unit (the same path the OPFOR use).
- `ForcePlacementPanel.test` — Delete unit is disabled until a force is selected, and fires on click.

## Verification

Backend ruff + `mypy app` clean, db + non-db suites green (migration 0021 applied locally). Frontend
353 vitest + tsc + eslint + prod build green. Deleting a seeded OPFOR in the creator and seeing it
stay gone is confirmed at the live `make dev` gate.
