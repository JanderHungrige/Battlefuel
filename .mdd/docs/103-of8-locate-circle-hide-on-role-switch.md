---
id: 103-of8-locate-circle-hide-on-role-switch
title: OF-8 locate circle hides on OF-8→OF-4 role switch
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-17
wave_status: complete
depends_on: []
relates: [104-fuel-run-confirm-deselect]
source_files:
  - frontend/src/App.tsx
routes: []
models: []
test_files: []
data_flow: reads-existing
last_synced: 2026-06-26
status: complete
phase: all
mdd_version: 11
tags: [of8, locate, role-switch, supply, map-overlay, bugfix]
path: SupplyUX/LocateMarker
known_issues:
  - "Halo clearing is verified at the live `make dev` gate, not in jsdom (App.test mocks MapView, so the purple locate layer is not rendered there) — per the repo convention for MapView-coupled interactions."
---

# 103 — OF-8 locate circle hides on OF-8→OF-4 role switch

## Why (bug)

Selecting a fuel depot (or fuel-fleet truck) on OF-8 activates the **purple locate halo**
(`located` state → `MapView` `locatePoint`/`locateDimmed`, v2 Wave 11 F5). Switching to OF-4
hid the depots but left the halo on the map — and *fully visible*, because `locateDimmed` is
OF-8-only (`if (!located || !isOf8) return false`, so on OF-4 the dim is dropped while
`located` is still set).

## Fix

The locate halo is an OF-8 concept, so it must be cleared when leaving OF-8. The role change is
handled in a dedicated `changeRole` handler (not a `useEffect` — avoids the
`react-hooks/set-state-in-effect` cascade) wired into `RoleToggle.onChange`:

```ts
const changeRole = useCallback((r: Role) => {
  setRole(r)
  if (r !== 'OF8') setLocated(null)
}, [])
```

`App.tsx` — `RoleToggle` now uses `onChange={changeRole}` instead of `onChange={setRole}`.

## Test

MapView is mocked in `App.test.tsx`, so the rendered purple layer is not observable in jsdom —
this is the repo's standing pattern for MapView-coupled visuals ("verified at the live `make dev`
gate"). The logic is a single OF-8 guard in `changeRole`. Verified live: OF-8 → locate a depot →
switch to OF-4 → halo gone with the depots.
