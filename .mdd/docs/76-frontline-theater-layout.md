---
id: 76-frontline-theater-layout
title: Frontline Theater Layout (East/West seed)
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-14
wave_status: active
depends_on: []
source_files:
  - backend/app/domain/frontline.py
  - backend/app/services/instance_seed.py
  - backend/app/providers/enemy_units.py
  - backend/app/services/supply_seed.py
routes: []
models:
  - unit_instances
  - fuel_depots
test_files:
  - backend/tests/test_frontline.py
data_flow: writes-existing
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [theater, frontline, scenario, seed, opfor, nato, east-west]
path: Scenario/Frontline
integration_contracts:
  - to: 77-frontline-weighted-threats
    function: "frontline_lon(lat)"
    when: "event engine weights threat spawns by distance to the front"
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 76 — Frontline Theater Layout (East/West seed)

Reshapes the default Hohenfels seed from a scattered/arbitrary placement into a coherent
**East (OPFOR) vs West (NATO)** battle separated by an **irregular north–south frontline**.
First feature of Wave 14; the frontline definition it introduces is the shared substrate the
threat-weighting feature (77) reuses.

## What it does
- **`app/domain/frontline.py`** (new) — the single shared definition of the front: five
  `(lat, lon)` control points weaving east/west of the theater centre (lon 11.85) so the line has
  **bulges** (salients east) and **gaps** (dents west) rather than a straight meridian.
  `frontline_lon(lat)` piecewise-linearly interpolates (clamped at the ends); `is_west` / `is_east`
  classify a point; `REAR_LON_MAX = 11.815` marks the deep-rear longitude for HQ/depots.
- **`instance_seed.py`** — NATO reseeded into the west: **6 forward combat units** (was 3) spread
  north–south just west of the front — `HAWK` recon, `COBRA` mech, `TIGER` armor, `LION` armor
  (new), `VIPER` mech, `FALCON` inf (new) — with `HQ ANVIL` + the three fuel trucks in the rear
  (≤ `REAR_LON_MAX`). New instance ids: `inst-armor-2`, `inst-mech-2`, `inst-inf-1`.
- **`enemy_units.py`** — the 3 OPFOR units repositioned east of the front (recon screen forward,
  mech/armor deeper east).
- **`supply_seed.py`** — both depots (`Main Supply Point`, `FARP North`) pulled back into the
  western rear (`FARP North` was previously east of the new front).

## Why
The theater needed to read as a real battle line so the rest of Wave 14 (threats on the front,
East-heavy) and the fuel-run/rendezvous work land on a sensible layout.

## Key decisions
- **Positions are derived from `frontline_lon`** (computed, then baked as literals in the seed
  tuples), so the force sits at a deliberate depth relative to the front; `test_frontline`
  re-derives the front and asserts the west/forward/rear/east relationship — if the control points
  move, the test flags any unit now on the wrong side.
- Frontline is **data, not drawn** — no map line was added; the layout is expressed purely through
  unit/depot positions and (in 77) threat density. Frontend reads positions from the API unchanged.

## Tests (`backend/tests/test_frontline.py`)
Geometry: interpolation, end-clamping, west/east complementarity, and **irregularity** (the front
both bulges east and dents west). Layout: every NATO unit west of the front; ≥6 combat units; HQ +
fuel trucks ≤ `REAR_LON_MAX`; combat line forward of the rear echelon; every OPFOR unit east of the
front; depots in the western rear; everything inside the Hohenfels bbox.

## Verification
backend: `test_frontline` + the seed/enemy/supply suites green; full backend suite green
(`-p no:randomly`, after `scripts/reset_road_conditions.py` — the `test_sim` completion test is the
documented DB-pollution flake, unrelated); ruff + mypy(strict) clean. Backend-only — no migration,
no frontend change. **Live gate pending** (`make dev` → :3001 → :3000).
