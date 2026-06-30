---
id: battlefuel-v2-wave-22
title: "Wave 22: Scenario creator — place forces, set threats, save/load (supersedes Wave 7)"
initiative: battlefuel-v2
initiative_version: 11
status: planned
depends_on: battlefuel-v2-wave-21
demo_state: "An operator can build and reload a custom start setting. A scenario creator places and removes blue and red forces on the map, choosing the unit from a dropdown organised in two tabs (fuel-related elements vs other troop elements). Placed units default to half-full fuel. Holding Shift or Ctrl selects multiple tiles to set their threat levels in one action. Opponents (red forces) are removable. Scenarios save and load by name so a hand-built setting can be reloaded later. (This supersedes the originally-planned Wave 7 scenario builder.)"
created: 2026-06-26
hash: 967a7bf7
---

# Wave 22: Scenario creator (supersedes Wave 7)

> **Requested 2026-06-26 (brain-dump batch).** A richer take on the planned Wave 7 scenario
> builder: both sides, categorised unit picker, multi-tile threat editing, removable opponents,
> and save/load. **Wave 7 is marked `superseded → Wave 22`** (same handling as W6 → W10).

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
| 1 | scenario-force-placement | docs/123-scenario-force-placement.md | complete | — |
| 2 | scenario-default-half-fuel | docs/124-scenario-default-half-fuel.md | complete | scenario-force-placement |
| 3 | opponents-removable | docs/125-opponents-removable.md | complete | — |
| 4 | multi-tile-threat-select | — | planned | — |
| 5 | scenario-save-load | — | planned | scenario-force-placement |

Build order: 1 → {2, 5}; 3 and 4 independent.

### Current state (code investigation 2026-06-26)
- **Units, enemy units, depots, threats, obstacles** all have existing models/providers and
  seed/placement services (`instance_seed.py`, `enemy_units.py`, `tile_seed.py`, manual obstacles
  + add-depot from Wave 10 F6). The scenario creator composes these into an editor + a persistence
  layer rather than inventing new entity types.
- **Enemy units exist but are display/seed/chatter-spawned** — no removal path yet (F3).
- **Threat is set per tile**; Wave 4 has a threat-planning UI but no multi-tile (Shift/Ctrl)
  selection (F4). Pairs with the Wave 21 multi-resolution threat model.

### Feature notes (requester 2026-06-26)
- **F1 scenario-force-placement** — place and remove **blue and red** forces on the map; choose
  the unit type from a dropdown with **two tabs: fuel-related elements** and **other troop
  elements**. Factory-pattern entry point so the unit catalog is data-driven.
- **F2 scenario-default-half-fuel** — newly placed units default to **half** fuel capacity.
- **F3 opponents-removable** — remove opponent (red) units (delete endpoint + map/panel action);
  available in normal play too, not only inside the creator.
- **F4 multi-tile-threat-select** — hold **Shift or Ctrl** to select multiple tiles and set their
  threat levels in one action (uses the Wave 21 threat model so the set respects grid resolution).
- **F5 scenario-save-load** — save the full hand-built state (blue + red forces, depots, threats,
  obstacles) under a name and reload it later; server-authoritative persistence.

## Open Research (resolve at plan-time)
- Scenario persistence shape: a `scenarios` table holding a serialised snapshot vs structured
  rows; how load resets/replaces live state (and interaction with the running sim clock + the
  Wave 14 theater seed).
- Unit catalog source for the dropdown tabs (existing unit-type data → fuel vs other split).
- Whether save/load is reachable from the Wave 15 landing flow or only in-app.
