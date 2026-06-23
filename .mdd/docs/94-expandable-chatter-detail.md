---
id: 94-expandable-chatter-detail
title: Expandable Chatter Detail
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-4
wave_status: in_progress
depends_on: [93-event-arrival-scheduler, 52-chatter-mgrs-tagging]
relates: [49-located-event-model, 95-chatter-filters-highlights]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/components/ChatterLog.tsx
routes: []
models: []
test_files:
  - frontend/src/components/ChatterLog.test.tsx
  - frontend/src/hooks/simSocket.test.ts
data_flow: frontend
last_synced: 2026-06-23
status: in_progress
phase: all
mdd_version: 11
tags: [combat-events, chatter, expandable-detail, frontend, click-to-locate]
path: Events/Chatter
---

# 94 — Expandable Chatter Detail

## Purpose

Turn each combat-event chatter line into a useful operator surface: a compact
**`<MGRS> - <headline>`** row that expands in-place to reveal the full event detail
(category, estimated threat, sender, supply relevance, sim timestamp, generated detail),
while keeping the Wave-3 click-to-locate behaviour intact.

## Architecture

Purely frontend; the `combat_event` WebSocket frame already carries the Wave-4 additive
fields (`catalog_id`, `supply_relevant`, `detail`) from the backend scheduler (doc 93).

- `api/types.ts` — `CombatEvent` gains optional `catalog_id`, `supply_relevant`, `detail`.
  `ChatterMessage` gains optional `category`, `estimated_threat`, `supply_relevant`,
  `detail`, `game_s` so a chatter row can render expanded detail without re-reading the
  combat-event map.
- `hooks/useSimSocket.ts` — when a `combat_event` becomes a chatter line, copy the new
  fields onto the `ChatterMessage`.
- `components/ChatterLog.tsx` — the row is no longer a single button. It is a container
  with (a) a **locate** button carrying the compact line (`data-testid="chatter-msg"`,
  preserving existing click-to-locate) and (b) an **expand** toggle shown only when the
  message has expandable detail. Expansion state is local view state (`Set<id>`).

## Business Rules

- The compact line stays `<MGRS> · <headline>` with sender secondary; expansion never
  changes that line.
- The expand toggle appears only for messages with detail-worthy fields (a combat event —
  detected by `category` or `event_id`). Plain sector/strategic lines render as before.
- Clicking the locate area still highlights and eases to the MGRS square (Wave-3 contract).
- The reducer stays pure; malformed frames are still dropped with a logged warning.
- Supply relevance renders as a clear `SUPPLY` / `—` marker so F5 can hang an action off it.

## Verification

Frontend tests cover: parsing/reducing the extended `combat_event` (additive fields survive),
building a chatter line that carries category/threat/detail, the compact-line render, the
expand toggle showing/hiding detail, and that click-to-locate still fires for combat and
sector lines.
