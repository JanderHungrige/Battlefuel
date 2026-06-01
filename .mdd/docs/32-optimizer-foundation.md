---
id: 32-optimizer-foundation
title: Optimizer Foundation — Advice Domain, Rationale & /advice Namespace
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-6
wave_status: active
depends_on: []
relates: [33-refuel-optimizer, 34-redistribution-optimizer, 35-movement-route-advisor, 36-advisor-ui]
source_files:
  - backend/pyproject.toml
  - backend/app/domain/advice.py
  - backend/app/api/advice.py
  - backend/app/main.py
routes:
  - GET /api/v1/advice/capabilities
models: []
test_files:
  - backend/tests/test_advice_foundation.py
data_flow: greenfield
last_synced: 2026-06-01
status: complete
phase: all
mdd_version: 11
tags: [advice, optimizer, recommendation, rationale, ortools, foundation]
path: Advice/Foundation
integration_contracts:
  - function: "Recommendation / AdviceResult (domain/advice.py)"
    when: "Every advice feature (33/34/35) returns AdviceResult of Recommendation(kind, target, action, score, rationale); the UI (36) renders that shape uniformly and maps `action` to an existing order request."
    consumers: [33-refuel-optimizer, 34-redistribution-optimizer, 35-movement-route-advisor, 36-advisor-ui]
satisfies_contracts: []
known_issues: []
security_read_sites: []
sister_projects: []
---

# 32 — Optimizer Foundation — Advice Domain, Rationale & /advice Namespace

## Purpose

The scaffold the Wave-6 advisors build on: the **`ortools`** dependency, a shared **advice
domain** (`Recommendation` with a **rationale**, wrapped in an `AdviceResult`), and the
versioned **`/api/v1/advice/*`** router namespace with a capabilities endpoint. No solving here
— just the contracts and conventions every advisor and the UI share.

## Architecture

```
pyproject.toml        add `ortools` to dependencies
domain/advice.py      RecommendationKind, Recommendation, AdviceResult
api/advice.py         APIRouter(prefix="/advice"); GET /advice/capabilities
main.py               mount the advice router under /api/v1
```

**Clarification of the plan's "service interface + factory":** the three advisors
(refuel-assignment 33, redistribution 34, movement 35) are **heterogeneous** — distinct inputs,
outputs, and endpoints — so a single config-selected advice factory is not a good fit and is
**not** introduced. The shared contract is the **`Recommendation`/`AdviceResult` domain + the
rationale convention** (this doc's integration contract); each advisor exposes its own endpoint
under `/advice`. The one genuinely swappable strategy — refuel truck selection — already uses the
Wave-5 `RefuelRecommender` factory (33 registers the `"ortools"` implementation there).

## Data Model

No DB tables. Domain types (frozen Pydantic):

- **`RecommendationKind`** — `route`, `reposition`, `refuel`, `redistribution`.
- **`Recommendation`** — `kind: RecommendationKind`, `target: str` (what it's about, e.g. a unit
  or depot id), `action: dict[str, object]` (a structured payload that maps to an existing order
  request — move/refuel/buy — so the UI can "apply" it), `score: float`, `rationale: str`.
- **`AdviceResult`** — `kind: RecommendationKind`, `recommendations: list[Recommendation]`,
  `summary: str | None`.

## API Endpoints

| Method | Path | Returns |
|--------|------|---------|
| GET | `/api/v1/advice/capabilities` | `{ kinds: string[] }` — advice kinds the engine currently offers (grows as 33/34/35 land) |

## Business Rules

- `rationale` is a required, terse human string on every `Recommendation` (the demo-state's "with
  rationale" guarantee). `score` is comparable within a single `AdviceResult` (lower = better cost,
  or documented per advisor).
- `action` is a plain dict shaped like the target order's request body (e.g.
  `{"endpoint": "move-orders", "instance_id": ..., "dest_lat": ..., "dest_lon": ...}`) so the
  frontend "apply" maps it to an existing client method without bespoke per-kind glue.

## Data Flow

Greenfield. Establishes types consumed by 33/34/35 (produce `AdviceResult`s) and 36 (renders them
+ applies `action`). The capabilities endpoint lets the UI discover which advice kinds exist.

## Dependencies

None (foundation). Adds the `ortools` runtime dependency used by 33 and 34.

## Security

No external input; read-only capabilities endpoint. `ortools` is a well-known Google package —
pin a version and confirm it installs in the venv and the Wave-7 Docker image (Open Research).

## Known Issues

(none yet)

## Bugs

(none yet — populated by /mdd bug when issues are reported)
