---
id: battlefuel-v2-wave-14
title: "Wave 14: Theater scenario — East/West frontline"
initiative: battlefuel-v2
initiative_version: 8
status: planned
depends_on: none
demo_state: "The default Hohenfels theater reads as a coherent East/West battle. NATO forces sit mostly in the WEST and OPFOR in the EAST, separated by an irregular North–South frontline (not a straight line — it has gaps and bulges). NATO combat units are positioned forward toward the frontline while depots and HQ sit in the rear (further west); there are a few more frontline combat units than before. Threats cluster around the frontline with a few sightings reaching deeper in, and the East sector is mostly threat-filled. New threats appear more slowly than today, and light threats (e.g. drone-activity sightings) fade away over time rather than persisting. Built on the existing seed + event-engine — no new map data."
created: 2026-06-08
hash: 009584ff
---

# Wave 14: Theater scenario — East/West frontline

> **Requested 2026-06-08, to land BEFORE Wave 13.** The seeded theater is currently scattered and
> arbitrary (NATO/OPFOR/depots mixed near the centre, threats fire on a uniform-random tile). This
> wave reshapes the default scenario into a readable **East (OPFOR) vs West (NATO) frontline** with
> threat activity concentrated where it belongs and a calmer, self-clearing threat tempo.
>
> **Wave number is a creation id, not build order** — per the initiative, this Wave 14 is built
> *before* Wave 13 (rendezvous fuel run).

## Demo-State
See frontmatter `demo_state`.
*(Not complete until demonstrated live — `make dev`, then `:3001`, then `:3000` per the wave DoD.)*

## Done-When (close-out gate)
Mark `complete` only after ALL three gates pass (never on a localhost demo):
- [ ] **tested local** — `make dev`, demoed on localhost
- [ ] **tested online** — merged to `dev-deployment`, deployed to `:3001`, verified there
- [ ] **merged into main / deployed in prod** — on `main`, live `:3000` (needs approval first)

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | frontline-theater-layout | — | planned | — |
| 2 | frontline-weighted-threats | — | planned | frontline-theater-layout |
| 3 | light-threat-decay | — | planned | — |

Build order: 1 → 2, with 3 independent (can land any time).

### Current state (from code research 2026-06-08)
- **Theater bounds** `theater.py:45` — Hohenfels `bbox(west=11.78, south=49.18, east=11.92, north=49.27)`,
  centre `11.85 / 49.225`. **Longitude 11.85 is the natural East/West split.**
- **NATO seed** `instance_seed.py:23` — 7 instances (HQ ANVIL, TIGER armor, VIPER mech, HAWK recon,
  TANKER/BOWSER/CISTERN fuel), hardcoded lat/lon, currently scattered centre/east (HAWK is eastmost at
  `11.885`).
- **OPFOR seed** `enemy_units.py:29` — 3 hostile units, already clustered east (`11.858–11.889`).
- **Depots** `supply_seed.py:21` — Main Supply Point (`11.835`) + FARP North (`11.872`).
- **Event emitter** `event_engine.py:131` — picks a **uniform-random tile** every
  `event_mean_interval_game_s = 120` (`config.py:75`); **no spatial weighting**. CSV catalog not yet
  loaded (hardcoded EventSpecs).
- **Expiry** — `drone_activity` reverts after 15 game-min (temporary), but there is **no general
  low-threat decay**; `threat_clears` is a permanent one-shot. So "light threats disappear" is only
  *partly* true today.

### Feature notes (requester 2026-06-08)
- **F1 frontline-theater-layout** — reseed the default scenario around an **irregular North–South
  frontline** near lon ≈ 11.85 (a deterministic poly-line with **gaps and bulges**, not a straight
  meridian). Place **NATO in the WEST**: combat units (armor/mech/recon + a **few more** frontline
  units than the current set) **forward** toward the frontline, **depots + HQ in the rear** (further
  west). Keep **OPFOR in the EAST**. Reuses `instance_seed.py` / `enemy_units.py` / `supply_seed.py`;
  the frontline definition lives in one place so F2 can reuse it. Deterministic (seeded) so tests and
  demos are stable.
- **F2 frontline-weighted-threats** — replace the uniform-random event location with **spatial
  weighting** keyed off the F1 frontline: most events spawn **near the frontline**, the **East sector
  is mostly threat-filled**, and a **few sightings appear deeper in** (west of the line). Also **slow
  the tempo** — raise `event_mean_interval_game_s` so new threats appear more slowly than now
  (config-driven, keep deterministic via the injected RNG). No change to the event catalog itself.
- **F3 light-threat-decay** — make **light threats fade**. Confirm `drone_activity` reverts (it does)
  and add a **general low-threat decay** so low-severity threat tiles drift back toward 0 over time
  instead of persisting (today only specific temporary events revert; `threat_clears` is permanent).
  Deterministic + unit-tested against the injected clock.

## Open Research (resolve at plan-time)
- **Frontline geometry** — exact poly-line (control points across the N–S span) + how far the
  bulges/gaps deviate from 11.85; how "front" vs "rear" depth is derived for unit placement.
- **Spatial weighting model** — distance-to-frontline falloff + East-sector fill probability + the
  rate of deep-in sightings; how this reads the F1 frontline.
- **Decay model** — which severities count as "light" (1–2?), decay step + interval, and floor;
  whether decay is a new periodic pass in `event_engine` or a per-tick mutation.
- **New unit count/types** — how many extra frontline combat units, and which types, to add to the 7.
- **Tempo value** — the new `event_mean_interval_game_s` default (slower than 120 game-s).
