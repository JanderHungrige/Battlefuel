---
id: 52-chatter-mgrs-tagging
title: MGRS-Tagged Combat Chatter
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-3
wave_status: active
depends_on: [49-located-event-model, 50-threat-mgrs-squares]
relates: [51-event-hover-icons, 23-ops-chatter-sectors]
source_files:
  - frontend/src/api/types.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/components/ChatterLog.tsx
  - frontend/src/map/MapView.tsx
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/hooks/simSocket.test.ts
  - frontend/src/hooks/useSimSocket.test.ts
  - frontend/src/components/ChatterLog.test.tsx
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [chatter, mgrs, combat-events, sender, click-to-locate, maplibre]
path: Map/Chatter
integration_contracts: []
satisfies_contracts:
  - from: 49-located-event-model
    function: combat_event WS frame (sender + lat/lon)
    when: building a chatter line for each combat event
    status: done
    verified_at: "frontend/src/hooks/useSimSocket.ts (combat_event → ChatterMessage with sender + combatEventMgrs(lat,lon)) + frontend/src/hooks/simSocket.ts (combatEventMgrs)"
known_issues: []
---

# 52 — MGRS-Tagged Combat Chatter

## Purpose

Surface each located combat event in the radio **chatter log**, tagged with its **MGRS coordinate**
and **sender** (the fake unit signature from the frame), and make the line **click-to-locate**: it
eases the map to the event and highlights its threat square. Extends the existing Wave-4 sector
click-to-locate (`23-ops-chatter-sectors`) from h3-index to combat-event id.

## Architecture

```
api/types.ts        ChatterMessage gains optional mgrs?, sender?, event_id?, lat?, lon?
simSocket.ts        combatEventMgrs(ev) — pure: formatMgrs(toMgrs(lat,lon)) (reuses Wave-2 mgrs util)
useSimSocket.ts     on a combat_event frame: store in combatEvents AND append a tagged chatter line
ChatterLog.tsx      renders the MGRS tag + sender; clickable via event_id (→ onSelectEvent) or h3_index
MapView.tsx         highlightEventId prop → 'combat-events-highlight' line layer + easeTo the event
App.tsx             highlightEventId state; ChatterLog onSelectEvent; passes highlightEventId to MapView
```

The backend already sends `sender` (and lat/lon) in the F1 `combat_event` frame — no backend change.
MGRS is derived **client-side** from lat/lon (consistent with the Wave-2 MGRS approach).

## Data Model

`ChatterMessage` adds (all optional, backward-compatible): `mgrs`, `sender`, `event_id`, `lat`,
`lon`. A combat-derived line: `{ text: <event headline>, mgrs, sender, event_id: <combat id>, lat,
lon }`. Sector lines (Wave 4) keep using `h3_index`.

## API Endpoints

None — consumes the existing `combat_event` WS frame.

## Business Rules

- One chatter line per combat event (FIFO with the existing 10-line cap).
- A line is clickable if it has `event_id` **or** `h3_index`; `event_id` takes precedence and routes
  to `onSelectEvent` (combat-square locate), else `onSelect` (sector hex locate).
- Click-to-locate: `highlightEventId` filters `combat-events-highlight` to that square and the map
  eases to the event centre.
- Malformed frames are still dropped with a logged warning (the socket is never torn down).

## Data Flow

`combat_event` frame → `useSimSocket` → `combatEventMgrs(ev)` builds the MGRS tag → `ChatterMessage`
(mgrs + sender + event_id + lat/lon) appended to `chatter` → `ChatterLog` renders + on click calls
`onSelectEvent(event_id)` → App `setHighlightEventId` → `MapView` highlights the square + eases to it.

## Dependencies

`49-located-event-model` (frame: sender + lat/lon), `50-threat-mgrs-squares` (the square + source to
highlight).

## Security

None — client rendering of server-sent located events.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
