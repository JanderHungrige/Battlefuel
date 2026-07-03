---
id: 128-tour-demo-expansion
title: Take-a-Tour Demo Expansion — graph, roads, forces, multi-tile, scenarios + branded demo
edition: BattleFuel
depends_on: []
source_files:
  - frontend/src/lib/tourSteps.ts
  - frontend/src/lib/tourTiming.ts
  - frontend/src/hooks/useTour.ts
  - frontend/src/components/TourButton.tsx
  - frontend/src/components/DemoBranding.tsx
  - frontend/src/components/DemoBranding.css
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/tourSteps.test.ts
  - frontend/src/lib/tourTiming.test.ts
data_flow: greenfield
last_synced: 2026-07-03
status: complete
phase: all
mdd_version: 11
tags: [take-a-tour, demo, driver.js, routing-graph, scenario-builder, branding, auto-play]
path: Onboarding/Take-a-Tour
integration_contracts: []
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 128 — Take-a-Tour Demo Expansion

## Purpose

Expand the existing "Take a tour" guided/auto walkthrough so it demonstrates the platform's
newer scenario-building and graph capabilities — the routing-graph overlay, adding roads/paths &
editing the graph (OF-4), placing forces, batch multi-tile threat selection (Shift/Ctrl-click),
and saving/loading scenarios — by opening each panel and sub-panel on screen as it is explained.
For show/demo use the auto-play mode now runs a fixed **3 seconds per step** and displays a
lower-left "Powered by World Fuel + Eraneos" branding overlay.

## Architecture

The tour is data-driven (established feature `take-a-tour`):

- `lib/tourSteps.ts` — declarative `TourStep[]` per role. Each step binds to a real on-screen
  element by selector and may carry a `before` (a sub-tab `click` and/or a named app `action`)
  that runs as the step is shown, revealing the *next* step's target. This expansion adds new
  shared steps (graph overlay, place-forces + panel, multi-tile + panel, scenarios + panel) and
  OF-4-only steps (add road/path, edit graph), plus new `TourActionKey`s.
- `hooks/useTour.ts` — driver.js orchestration; auto-play advances after `autoAdvanceDelayMs`.
  Extended to expose `demo` (true while an **auto** tour is active) so branding can mount.
- `lib/tourTiming.ts` — auto-advance timing. Changed from length-scaled [4s,5s] to a fixed
  `TOUR_STEP_MS = 3000` for every step.
- `components/DemoBranding.tsx` — fixed lower-left "Powered by" overlay (World Fuel + Eraneos
  logos, reused from the landing page `/logos/*`), portalled to `document.body` above the
  driver.js overlay; mounted by `TourButton` only while `tour.demo` is true.
- `App.tsx` — supplies the new tour `actions` (enable graph overlay, open force-placement, seed a
  demo multi-tile selection, open scenarios) and a tour-end cleanup that closes those demo panels.

New tour actions are **demo-only and mutually exclusive** — each closes the other demo panels so
the right-hand rail shows one panel at a time during auto-play.

## Data Model

None — presentational/onboarding feature. No API, no DB.

## API Endpoints

None.

## Business Rules

- **Role scoping:** graph overlay, place-forces, multi-tile, and scenarios steps are shared
  (both roles — their toolbar controls render for any role with a theater). Add-road / add-path /
  edit-graph steps are **OF-4 only** (`canShow('OF4','drawGraph')`); they must not appear in the
  OF-8 sequence, whose toolbar lacks those controls.
- **Panel reveal via `before`:** a step that needs a panel present anchors on the always-present
  toolbar toggle (or `.map-area`) and its `before` opens the panel, so the *following* step can
  anchor on the panel (`force-placement-panel`, `multi-cell-panel`, `scenario-panel`). This mirrors
  the existing rendezvous-planner reveal.
- **Fixed timing:** every auto-play step dwells exactly `TOUR_STEP_MS` (3000 ms). Space still
  toggles pause. Guided mode is manual (unchanged).
- **Branding scope:** the lower-left branding overlay shows **only during auto-play** (`demo`),
  never in guided mode or normal app use.
- **Cleanup on end:** ending the tour (close, Escape, or last step) restores the normal UI —
  clears selection/planning AND closes the demo panels (force placement, scenarios, multi-tile)
  and turns the graph overlay back off.
- **Demo multi-select seed:** `multi-select-demo` seeds the batch selection from up to 3 real unit
  centers so `MultiCellThreatPanel` mounts with a realistic count; no-op if there are no units.

## Data Flow

Greenfield (frontend-only). Logo assets are the existing `/logos/World-Fuel-Services-Logo.png`
and `/logos/eraneos_Logo-and-BrandSign-black.png` already served for the landing page.

## Dependencies

Builds on the existing `take-a-tour` feature and the Wave 20/22 controls it now surfaces
(routing-graph overlay, draw-graph, scenario force-placement, multi-tile threat select,
scenario save/load). No new feature dependencies.

## Security

None — no external input, storage, processes, or network calls introduced.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
