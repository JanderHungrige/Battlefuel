---
id: 51-event-hover-icons
title: Combat-Event Category Icons & Hover
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-3
wave_status: active
depends_on: [50-threat-mgrs-squares]
relates: [49-located-event-model]
source_files:
  - frontend/src/map/eventIcons.ts
  - frontend/src/map/overlays.ts
  - frontend/src/map/MapView.tsx
routes: []
models: []
test_files:
  - frontend/src/map/eventIcons.test.ts
  - frontend/src/map/overlays.test.ts
data_flow: reads-existing
last_synced: 2026-06-03
status: complete
phase: all
mdd_version: 11
tags: [combat-events, icons, hover, maplibre, symbology, offline]
path: Map/Threat
integration_contracts: []
satisfies_contracts: []
known_issues: []
---

# 51 — Combat-Event Category Icons & Hover

## Purpose

Mark each threat square (from `50-threat-mgrs-squares`) with a **category glyph** (drone / mine /
enemy-near / checkpoint / fires) at the square centre, and show a **hover popup** with the event
detail (category, event, estimated threat, sender). Makes the threat picture readable at a glance.

## Architecture

```
eventIcons.ts   pure: iconForEvent(category, event) → {key, glyph, label}; ALL_EVENT_ICONS list
overlays.ts     combatEventsToGeoJSON now also sets an `icon` property (the glyph key) per feature
MapView.tsx     registers a rasterized glyph image per ALL_EVENT_ICONS (offline canvas, same
                technique as the MGRS labels); 'combat-events-icons' symbol layer (symbol-placement
                'point' → polygon centroid) draws the glyph; hover popup on 'combat-events-fill'
```

Icon selection is pure + unit-tested; glyphs are rasterized to canvas images at runtime (offline —
no glyph PBF needed), mirroring the Wave-2 MGRS-label and unit-SIDC icon technique.

## Data Model

`EventIcon = { key: string; glyph: string; label: string }`. `iconForEvent` maps an event to one of
a small fixed set (mirrors the backend `classify` ordering): mine/IED → ◆, air/drone → drone, hostile
→ enemy-near, chokepoint/route/crossing → checkpoint, strike/ambush/fires → fires, else generic.
`combatEventsToGeoJSON` adds `icon: iconForEvent(category, event).key` to each feature's properties.

## API Endpoints

None — pure client rendering over the existing `combat_event` data.

## Business Rules

- One glyph per square, drawn at the polygon centroid (`symbol-placement: 'point'`).
- All glyph images are registered once (fixed set), so no per-frame image churn.
- Hover popup (mouseenter/mouseleave on `combat-events-fill`) shows: event, category, est. threat
  `n/5`, sender. Right-click hex inspect (Wave-2) is unchanged.

## Data Flow

`combatEvents` → `combatEventsToGeoJSON` (adds `icon`) → `combat-events` source →
`combat-events-icons` symbol layer (`icon-image: ['get','icon']`). Glyph images registered from
`ALL_EVENT_ICONS` at map load.

## Dependencies

`50-threat-mgrs-squares` (the square polygons + source) and `49-located-event-model` (category/event).

## Security

None — client rendering only.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
