---
id: 95-chatter-filters-highlights
title: Chatter Filters & Highlights
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: in_progress
depends_on: [94-expandable-chatter-detail, 50-threat-mgrs-squares]
relates: [49-located-event-model, 96-supply-event-advisor-actions]
source_files:
  - frontend/src/lib/chatterFilter.ts
  - frontend/src/components/ChatterFilterControls.tsx
  - frontend/src/components/ChatterLog.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/chatterFilter.test.ts
  - frontend/src/components/ChatterFilterControls.test.tsx
data_flow: frontend
last_synced: 2026-06-23
status: in_progress
phase: all
mdd_version: 11
tags: [combat-events, chatter, filters, threat-threshold, frontend]
path: Events/Chatter
---

# 95 — Chatter Filters & Highlights

## Purpose

Give the operator compact controls to filter the chatter feed and highlight event traffic on
the map: an **all / threat / supply** mode, a **threat-threshold** slider, and per-zone map
square toggles (**combat / blocked / threat**). Both surfaces reuse the backend's central
event classification (the `zone` + `estimated_threat` already on each `combat_event`), not a
second frontend interpretation.

## Architecture

- `lib/chatterFilter.ts` (pure) — owns the `ChatterFilters` shape, `DEFAULT_CHATTER_FILTERS`,
  and two predicates: `chatterVisible(message, filters)` for the radio list and
  `combatEventVisible(event, filters)` for the map squares. Plus `filterChatter` /
  `filterCombatEvents` convenience wrappers. No React, no map — unit-testable.
- `components/ChatterFilterControls.tsx` — the compact control strip (mode buttons, threshold
  slider, zone checkboxes). Controlled component: value in, `onChange` out.
- `components/ChatterLog.tsx` — gains an optional `children` slot rendered under the title so
  the OF-4 chatter can host the controls inside its own panel (strategic feed passes none).
- `App.tsx` — owns the `ChatterFilters` state, applies `filterChatter` to the chatter list and
  `filterCombatEvents` to the map's combat-event squares.

## Business Rules

- A chatter line counts as a **combat line** when it carries `event_id` + `estimated_threat`.
  Plain sector/strategic lines are never combat lines.
- Mode `all`: sector/strategic lines always shown; combat lines shown when
  `estimated_threat >= minThreat`.
- Mode `threat`: only combat lines with `estimated_threat >= minThreat`.
- Mode `supply`: only combat lines with `supply_relevant` true (threshold does not apply —
  supply relevance is orthogonal to threat level).
- Map squares: a square renders only when its `zone` toggle is on **and**
  `estimated_threat >= minThreat`. Zone semantics come from the backend (combat=red,
  blocked=yellow, threat=graded), so the highlight matches Wave-3 exactly.
- Controls stay compact and live inside the existing chatter panel — no new floating window.

## Verification

Pure tests cover each mode + threshold boundary for `chatterVisible`, and zone-toggle +
threshold for `combatEventVisible`. Component tests cover the control strip emitting mode,
threshold, and zone changes.
