---
id: 81-landing-entry-gate
title: Landing Entry Gate
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-15
wave_status: active
depends_on: [80-branded-landing-page]
source_files:
  - frontend/src/lib/entryGate.ts
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/entryGate.test.ts
  - frontend/src/App.test.tsx
data_flow: greenfield
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [landing, gate, session, ui, frontend]
path: Onboarding/Landing
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 81 — Landing Entry Gate

Gates the app behind the landing page (feature 80) — shown once per browser session.

## What it does
- **`lib/entryGate.ts`** (pure) — `ENTRY_KEY`, `hasEntered(storage)`, `markEntered(storage)`. Reads
  the marker `"1"` from a `Storage`; wrapped in try/catch so a blocked/absent storage (private mode)
  degrades to "always show" rather than throwing.
- **`App.tsx`** — `entered` state initialised from `hasEntered(sessionStorage)`. When not entered,
  App renders `<LandingPage onEnter={…}>` instead of the map shell; `onEnter` calls
  `markEntered(sessionStorage)` and flips the state to reveal the app. Using **`sessionStorage`**
  means a reload within the same session skips the gate, a fresh session shows it again. The gate
  branch sits after all hooks (no conditional-hook violation); data fetching still runs behind the
  landing so the app is warm on Enter.

## Key decisions
- `sessionStorage` (once per session) over `localStorage` (once ever) or always-on — balances the
  "pretend we vetted you" framing with not nagging on every reload. Easily swapped (one call site).
- Gate logic is a pure module so it's unit-tested without the DOM; App just wires it.

## Tests
`entryGate.test.ts` — not-entered on fresh storage; entered after `markEntered`; degrades safely
when storage throws; only the exact `"1"` marker counts; `hasEntered` never writes.
`App.test.tsx` — new case: with storage cleared the landing gates the app (`landing` present, `map`
absent); existing shell tests set the marker in `beforeEach` so they render the app directly.

## Verification
Frontend suite 219 passed; tsc + eslint + prod build clean. Frontend-only. **Live gate pending.**
