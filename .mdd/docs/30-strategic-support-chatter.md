---
id: 30-strategic-support-chatter
title: Strategic Support Chatter — OF-8 Feed
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-5
wave_status: active
depends_on: [28-role-view-switch, 29-of8-supply-ui, 23-ops-chatter-sectors, 14-sim-engine]
relates: [29-of8-supply-ui]
source_files:
  - backend/app/providers/strategic_feed.py
  - backend/app/services/sim_runner.py
  - backend/app/config.py
  - frontend/src/api/types.ts
  - frontend/src/hooks/simSocket.ts
  - frontend/src/hooks/useSimSocket.ts
  - frontend/src/components/ChatterLog.tsx
  - frontend/src/App.tsx
  - frontend/src/index.css
routes: []
models: []
test_files:
  - backend/tests/test_strategic_feed.py
  - frontend/src/hooks/simSocket.test.ts
test_files_note: also extends frontend ChatterLog/useSimSocket coverage
data_flow: mixed
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [strategic, support, chatter, feed, of-8, websocket, sim]
path: Supply/Feed
integration_contracts: []
satisfies_contracts:
  - from: 28-role-view-switch
    function: "canShow(role, 'strategicFeed')"
    when: "The strategic feed renders only in OF-8, gated through the role registry."
    status: done
    verified_at: "frontend/src/App.tsx:233"
known_issues: []
security_read_sites: []
sister_projects: []
---

# 30 — Strategic Support Chatter — OF-8 Feed

## Purpose

Give the OF-8 commander a strategic-level message feed: scripted "support" messages keyed to
sim game-time (e.g. "convoy inbound", "depot resupply en route") plus live order
notifications (buy delivered, refuel complete). Rendered in an OF-8-only feed that reuses the
Wave-4 `ChatterLog` component.

## Architecture

```
providers/strategic_feed.py   StrategicFeedProvider(ABC)→Scripted/None; build_strategic_feed_provider()
services/sim_runner.py         apply_strategic_feed() — broadcasts due strategic_message frames
hooks/simSocket.ts             parseStrategicMessage (pure)
hooks/useSimSocket.ts          reduces strategic_message + buy/refuel frames → `strategic` feed
components/ChatterLog.tsx       reused (optional title/className/testId/onSelect)
App.tsx                         second ChatterLog for the strategic feed, gated by canShow(role,'strategicFeed')
```

Scripted strategic messages mirror the Wave-4 tile feed: each fires once when game-time first
passes its `at_game_s`. Order notifications (`buy_order_update` / `refuel_order_update`, from
features 27/26) are routed into the same OF-8 strategic feed rather than the tactical chatter.

## Data Model

Backend: `StrategicEvent(at_game_s, text, category)` (scripted schedule). WS frame
`strategic_message` = `{ type, text, category, game_s }`. Frontend reduces strategic /
buy / refuel frames into `ChatterMessage[]` (`strategic`), FIFO-capped like chatter.

## API Endpoints

None (WebSocket frame only).

## Business Rules

- `strategic_feed_provider` config selects `scripted` (ships) or `none` (tests/CI).
- `apply_strategic_feed(prev_s, now_s)` broadcasts each event whose `at_game_s ∈ (prev_s, now_s]`
  exactly once (same `due_events` semantics as the tile feed).
- Frontend routes `strategic_message`, `buy_order_update`, and `refuel_order_update` into the
  `strategic` feed; malformed frames dropped with a logged warning.
- The strategic feed renders only in OF-8 (`canShow(role, 'strategicFeed')`); the tactical
  chatter remains in both roles.

## Data Flow

Sim clock → scripted strategic events + order frames → `strategic_message` / order frames over
WS → `useSimSocket.strategic` → OF-8 `ChatterLog`.

## Dependencies

28 (role gating), 29 (OF-8 view + order frames), 23 (ChatterLog infrastructure), 14 (sim tick).

## Security

No external input; broadcast-only server→client frames over the existing WS. No secrets.

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
