---
id: 80-branded-landing-page
title: Branded Landing Page
edition: BattleFuel
initiative: battlefuel-v2
wave: battlefuel-v2-wave-15
wave_status: active
depends_on: []
source_files:
  - frontend/src/components/LandingPage.tsx
  - frontend/src/components/LandingPage.css
routes: []
models: []
test_files:
  - frontend/src/components/LandingPage.test.tsx
data_flow: greenfield
last_synced: 2026-06-08
status: complete
phase: all
mdd_version: 11
tags: [landing, branding, ui, eraneos, world-fuel, frontend]
path: Onboarding/Landing
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 80 — Branded Landing Page

A dark, modern front door for BattleFuel: animated background, the hero wordmark, a faux security
clearance check, an Enter button, and a "powered by" row with the partner logos. Presentational —
the parent decides when it's shown (feature 81).

## What it does
- **`LandingPage.tsx`** — `({ onEnter, verifyMs? })`. Hero (`BATTLE`**`FUEL`** wordmark + eyebrow +
  tagline); a **faux clearance check** that starts on "Verifying clearance…" (spinner) and flips to
  **"User security access: APPROVED"** after `verifyMs` (default 1600 ms); the **Enter BattleFuel**
  button is **disabled until approved** and calls `onEnter` on click; a **"powered by"** row with
  the Eraneos + World Fuel Services logos (`/logos/…`, synced by `sync-assets`) on a light chip so
  they read on the dark background. `verifyMs` is injectable so tests don't wait on a real timer.
- **`LandingPage.css`** — dark theme (`#070a10`) with the app's amber `#FFD9BD` + NATO-blue accents.
  **Animated background**: a drifting masked grid, two slow-floating radial glows (amber/blue), and
  a vertical scanning sweep; the card rises in; the approved chip pops. All animation is disabled
  under `prefers-reduced-motion`.

## Key decisions
- Pure presentational + `onEnter` callback — no app/router knowledge here (gating is feature 81).
- The "security" check is **cosmetic theatre** (a timer, no real auth) — it exists to *pretend* the
  user was vetted, per the request. Enter is gated on it so the approval reads as meaningful.
- Logos sit on a white chip because both supplied marks are dark-on-transparent and would vanish on
  the dark background.

## Tests (`LandingPage.test.tsx`)
Renders the hero + both logos; Enter is disabled while verifying then enabled after approval;
clicking the enabled Enter fires `onEnter`; a click while still pending does **not** fire `onEnter`.

## Verification
Frontend suite 219 passed; tsc + eslint + prod build (`tsc -b` + vite) clean. Frontend-only.
**Live gate pending** (`make dev` → :3001 → :3000); the visual look is for the requester to eyeball.
