---
id: 81-landing-entry-gate
title: Landing Entry Gate
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-15
wave_status: active
depends_on: [80-branded-landing-page]
source_files:
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/App.test.tsx
data_flow: greenfield
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [landing, gate, ui, frontend]
path: Onboarding/Landing
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 81 — Landing Entry Gate

Gates the app behind the landing page (feature 80). **Shows on every page load / refresh** — the
faux security clearance is part of the demo, so it is *not* persisted.

## What it does
- **`App.tsx`** — `entered` is plain in-memory state (`useState(false)`). When not entered, App
  renders `<LandingPage onEnter={() => setEntered(true)} />` instead of the map shell; clicking
  Enter flips the state to reveal the app for that page-load only. A refresh re-runs `App` →
  `entered` is `false` again → the landing (and its clearance check) shows again.
- The gate branch sits after all hooks (no conditional-hook violation); data fetching still runs
  behind the landing so the app is warm on Enter.

## Key decisions
- **No persistence** (requester 2026-06-08): the gate is deliberately in-memory so every refresh
  brings the landing back. An earlier `sessionStorage` version (once-per-session) was dropped —
  the persisted marker made refreshes skip the landing, which is not wanted. The `entryGate`
  storage helper was removed with it.
- Gate wiring lives in `App`; the landing's own behaviour/visuals are owned by feature 80.

## Tests (`App.test.tsx`)
`LandingPage` is mocked to a single Enter button so shell tests step past the gate
deterministically (the real clearance timer/visuals are covered in `LandingPage.test`). Cases: the
app is **gated** behind the landing until Enter (landing present, `map` absent); after Enter the
brand + OSM attribution show, the map renders for the theater, and a theater-load failure surfaces
the error.

## Verification
Frontend suite 214 passed; tsc + eslint + prod build clean. Frontend-only. **Live gate pending.**
