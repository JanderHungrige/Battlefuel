---
id: 96-supply-event-advisor-actions
title: Supply-Event Advisor Actions
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: in_progress
depends_on: [94-expandable-chatter-detail, 36-advisor-ui]
relates: [95-chatter-filters-highlights, 33-refuel-optimizer, 34-redistribution-optimizer]
source_files:
  - frontend/src/lib/supplyAdvisorAction.ts
  - frontend/src/hooks/useAdvisor.ts
  - frontend/src/components/ChatterLog.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/supplyAdvisorAction.test.ts
data_flow: frontend
last_synced: 2026-06-23
status: in_progress
phase: all
mdd_version: 11
tags: [combat-events, chatter, advisor, supply, frontend]
path: Events/Chatter
---

# 96 — Supply-Event Advisor Actions

## Purpose

For a `supply_relevant` combat-event chatter line, expose an **Ask advisor** action that calls
the existing Wave-6 advisor machinery and surfaces an advisory recommendation. It must **not**
auto-place any order — the operator still reviews and applies a recommendation manually.

## Architecture

- `lib/supplyAdvisorAction.ts` (pure) — `supplyAdviceKind(category, event)` maps a supply event
  to the right `RecommendationKind` the advisor already understands. No React; unit-testable.
- `hooks/useAdvisor.ts` — gains `ask(kind)`: opens the advisor panel and requests that kind in
  one call (composes the existing `request` + open state). The existing `apply` already pushes an
  `order` chatter line when the operator applies a recommendation — reused unchanged.
- `components/ChatterLog.tsx` — the expanded detail of a supply-relevant line renders an
  **Ask advisor** button when an `onAskAdvisor` callback is provided.
- `App.tsx` — passes `onAskAdvisor` only when the role can see the advisor (OF-8). The handler
  maps the kind, calls `advisor.ask(kind)`, and pushes a brief status line for feedback.

## Business Rules

- Category → advisor kind mapping (deterministic):
  - **Refueling & Fuel** (depot low, bingo fuel, tanker loss, emergency request) → `refuel`.
  - **Movement & Access** (route RED/AMBER, road damaged, chokepoint, minefield, escort) →
    `reposition` (a route/reposition warning).
  - everything else supply-relevant (Supply Chain & Rearming, Logistics & Support, …) →
    `redistribution`.
- The action **never** places an order. It only requests advice; applying stays a separate,
  explicit operator step through the existing AdvisorPanel.
- The Ask-advisor affordance only appears for `supply_relevant` lines and only when the advisor
  is available for the current role.

## Verification

Pure tests cover the category → kind mapping (each branch + default). Applying a recommendation
and its resulting `order` chatter line are already covered by the Wave-6 advisor tests.
