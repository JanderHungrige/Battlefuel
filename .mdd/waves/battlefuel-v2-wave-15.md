---
id: battlefuel-v2-wave-15
title: "Wave 15: Branded landing page + faux security gate"
initiative: battlefuel-v2
initiative_version: 9
status: planned
depends_on: none
demo_state: "On opening BattleFuel the user first lands on a modern, branded landing page — a hero with the BattleFuel identity and tagline, a 'Powered by' row showing the Eraneos and World Fuel Services logos, and a faux security panel that briefly 'verifies clearance' and then reads 'USER SECURITY ACCESS: APPROVED'. An 'Enter BattleFuel' button then takes the user into the operational map app. The gate shows once per browser session (a reload within the session goes straight to the app)."
created: 2026-06-08
hash: 245463cf
---

# Wave 15: Branded landing page + faux security gate

> **Requested 2026-06-08, to land BETWEEN Wave 14 and Wave 13.** A polished front door for the
> demo: modern landing page, Eraneos + World Fuel "powered by" branding, a *pretend* security
> clearance check ("USER SECURITY ACCESS: APPROVED"), and an Enter button into the app.

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
| 1 | branded-landing-page | docs/80-branded-landing-page.md | complete | — |
| 2 | landing-entry-gate | docs/81-landing-entry-gate.md | complete | branded-landing-page |

Build order: 1 → 2.

**Build status (2026-06-08):** both features built + green (frontend 219 tests, tsc, eslint, prod
build; frontend-only). Dark/modern look with an animated background (drifting grid + floating
glows + scan sweep), faux "USER SECURITY ACCESS: APPROVED" clearance, Enter button, Eraneos +
World Fuel "powered by" logos; gate is **in-memory only — the landing shows on every page load /
refresh** (requester 2026-06-08; the once-per-session `sessionStorage` version was dropped). Wave
stays **open** — Done-When gates below not yet met (awaiting local demo → `:3001` → prod).

### Feature notes (requester 2026-06-08)
- **F1 branded-landing-page** — a new, visually polished `LandingPage` component (modern hero with
  the BattleFuel name/tagline; a **"Powered by"** row with the **Eraneos** + **World Fuel Services**
  logos, already at `/logos/eraneos_Logo-and-BrandSign-black.png` + `/logos/World-Fuel-Services-Logo.png`
  via `sync-assets`; a **faux security panel** that briefly shows "Verifying clearance…" then
  **"USER SECURITY ACCESS: APPROVED"**; and an **"Enter BattleFuel"** button). Presentational —
  takes an `onEnter` callback. Aim for a distinctive, production-grade look (use the
  `frontend-design` skill), not generic. Self-contained CSS.
- **F2 landing-entry-gate** — gate the app behind the landing: `App` renders `LandingPage` until the
  user clicks Enter, then reveals the existing map app. Persist "entered" in **`sessionStorage`** so
  a reload within the same session skips straight to the app (a fresh session shows the gate again).
  Pure, testable gate helper (e.g. `lib/entryGate.ts`: read/initial state + mark-entered) so the
  storage logic is unit-tested without the DOM.

## Open Research (resolve at plan-time, requester 2026-06-08)
- **Security-check presentation** → a short "Verifying clearance…" → "ACCESS APPROVED" reveal
  (~1.5 s) vs. a static approved badge. *(Default: brief animated reveal, then enable Enter.)*
- **Show frequency** → once per browser session (`sessionStorage`). *(Default; easily switched to
  always-on or `localStorage` once-ever.)*
- **Exact copy / tagline** → BattleFuel hero tagline + the security line wording.

## Relationship to Wave 8
Wave 8 ("Landing page + data-integration guide") overlaps the *landing page* part. This wave
delivers the **landing page UI + faux security gate**; Wave 8 is thereby reduced to the
**data-integration guide** (DB/data model, expected columns, adding a source) plus any pitch
enrichment — login still deferred to `TODO.md`. (Recorded as a build-order note in the initiative.)
