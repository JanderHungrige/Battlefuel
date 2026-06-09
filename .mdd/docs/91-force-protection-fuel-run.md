---
id: 91-force-protection-fuel-run
title: Force-Protection Fuel Run — warn + confirm when a tanker routes through threat
edition: MDD
depends_on: [74-routed-fuel-run, 85-rendezvous-routing, 87-plan-rendezvous-ui]
relates: []
source_files:
  - frontend/src/lib/forceProtection.ts
  - frontend/src/components/FuelRunPanel.tsx
  - frontend/src/components/PlanRendezvousPanel.tsx
routes: []
models: []
test_files:
  - frontend/src/lib/forceProtection.test.ts
  - frontend/src/components/FuelRunPanel.test.tsx
  - frontend/src/components/PlanRendezvousPanel.test.tsx
data_flow: greenfield
last_synced: 2026-06-09
status: complete
phase: all
mdd_version: 11
tags: [force-protection, fuel-run, rendezvous, threat, of-8, ui]
path: Supply/Force Protection
integration_contracts: []
satisfies_contracts: []
known_issues: []
sister_projects: []
initiative: battlefuel-v2
wave: battlefuel-v2-wave-13
wave_status: complete
---

# 91 — Force-Protection Fuel Run

## Purpose

When a fuel run or rendezvous routes a **tanker through threat tiles**, the operator should be
prompted to consider **force protection**. This adds a warning and gates the dispatch behind an
explicit **"Confirm … with force protection"** acknowledgment, reusing the route `threat_max`
already returned by planning — no backend change.

## Architecture

- **`lib/forceProtection.ts`** (pure): `needsForceProtection(threatMax)` → true at/above the
  threat-sector threshold (3/5, matching the existing route-warning convention). Plus a label
  helper. Unit-tested.
- **FuelRunPanel (W12)** — when the *selected* route option's `threat_max` triggers it, shows a
  "force protection should be considered" warning and relabels the confirm button to **"Confirm
  fuel run with force protection"**. The acknowledgment is the explicit button press (same
  handler).
- **PlanRendezvousPanel (F3)** — same gate driven by the **tanker** route's `threat_max` for the
  selected metric: the warning shows and **Order now** / **Send order** relabel to include
  "with force protection".

## Business Rules

- Trigger: the tanker's chosen route `threat_max >= 3` (crosses a threat sector). Below that, no
  warning and the normal confirm label.
- The gate is advisory + acknowledgment-by-action (one click); it never blocks an operator who
  accepts the risk.

## Data Flow

Greenfield UI logic over the existing `RouteOption.threat_max`. No new endpoints or storage.

## Dependencies

- **74-routed-fuel-run** / **85-rendezvous-routing** — supply the route options carrying `threat_max`.
- **87-plan-rendezvous-ui** — the rendezvous panel this augments.

## Security

Frontend only; no secrets.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
