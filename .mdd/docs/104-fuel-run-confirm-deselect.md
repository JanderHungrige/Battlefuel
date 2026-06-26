---
id: 104-fuel-run-confirm-deselect
title: Fuel-run confirm deselects the mover + clears its locate halo
edition: MDD
initiative: battlefuel-v2
wave: battlefuel-v2-wave-17
wave_status: complete
depends_on: []
relates: [103-of8-locate-circle-hide-on-role-switch]
source_files:
  - frontend/src/hooks/useFuelRun.ts
  - frontend/src/App.tsx
routes: []
models: []
test_files:
  - frontend/src/hooks/useFuelRun.test.ts
data_flow: reads-existing
last_synced: 2026-06-26
status: complete
phase: all
mdd_version: 11
tags: [of8, fuel-run, deselect, locate, supply, bugfix]
path: SupplyUX/FuelRun
---

# 104 — Fuel-run confirm deselects the mover + clears its locate halo

## Why (bug)

Selecting a supply fleet and creating a fuel run: on **confirm** the truck dispatches (icon
moves with the order) but the unit stayed selected and its purple locate halo lingered — and
became fully visible. The OF-4 move order does the right thing: `planning.confirmMove(clear)`
clears all selection state on a successful dispatch. The fuel-run confirm
(`onConfirm={fuelRun.confirm}`) only reset the hook's *internal* state, never the App-level
`selectedUnitId` / `located`.

## Fix

Mirror the OF-4 `confirmMove(clear)` pattern by giving `useFuelRun.confirm` an optional `onDone`
callback fired **only on a successful dispatch** (after `reset()`), and pass the App's `clear`:

```ts
// useFuelRun.ts
confirm: (onDone?: () => void) => void
// ...inside the createFuelRun().then():
refetch()
reset()
onDone?.()           // deselect mover + clear locate halo, like the OF-4 move confirm
```

```tsx
// App.tsx
onConfirm={() => fuelRun.confirm(clear)}
```

On failure `onDone` is **not** called — the panel/selection stays so the operator can retry
(matches `confirmMove`). This is consistent with `useMoveRefuelStop`, which already takes an
`onDone`.

## Test

`frontend/src/hooks/useFuelRun.test.ts` (truck-first flow → review → confirm):
- confirm dispatches `createFuelRun`, resets to `idle`, calls `refetch` + `onDone` on success;
- a rejected dispatch sets the failure message and does **not** call `onDone` (stays in `review`);
- confirming before a route is planned is a no-op (no dispatch, no `onDone`).
