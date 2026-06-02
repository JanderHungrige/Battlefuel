# BattleFuel — Project Instructions

Project-level rules for BattleFuel. These **extend** the global `~/.claude/CLAUDE.md`.
Where they differ from a global rule, the reason is stated explicitly and this file wins
for this repository.

See `.mdd/initiatives/battlefuel.md` for the full product description and wave roadmap.

---

## What BattleFuel Is

An interactive command game and decision-support tool focused on **fuel logistics and
supply-chain orchestration** on an offline, real-world OpenStreetMap-based map. Two roles:
**OF-4 (battalion, tactical)** and **OF-8 (joint force, supply/distribution)**. A modular
optimization engine advises on movement, threat-aware routing, refueling, and stock
redistribution. Built so the data layer can swap from seeded data → real values → live
streams without rewrites.

---

## Locked Architecture (do not change without updating the initiative doc)

| Concern | Decision |
|---------|----------|
| Backend | **Python 3.12+ / FastAPI** |
| Frontend | **TypeScript + React + MapLibre GL** |
| Database | **PostgreSQL + PostGIS** |
| Routing | **pgRouting** with a custom edge/node cost function (threat, minefields, recon, terrain as first-class graph attributes) |
| Time model | **Continuous real-time simulation** (live sim clock) |
| Realtime transport | **WebSockets** (FastAPI-native) |
| Map | Offline, one fixed pre-packaged seed theater (MVP); **hex** grid |
| Symbology | **APP-6** via the `milsymbol` JS library |
| Scope | **Single-user, server-authoritative** (designed to allow multi-user later) |
| Optimizer | Rule-based/heuristic + **OR-Tools** (ML predictions deferred) |
| State | Persistent game state from day one |
| Deploy (Wave 7) | Docker → Hetzner via OpenTofu |

---

## Language Rules — clarification of the global "TypeScript always"

The global rulebook says *"all new files must be TypeScript."* **For BattleFuel this applies
to the frontend only.** The backend is Python by deliberate decision (geospatial + routing +
optimization libraries). Concretely:

- **Frontend (`/frontend` or equivalent):** TypeScript, strict mode, no `any` unless
  unavoidable and commented.
- **Backend (`/backend` or equivalent):** Python, **fully type-annotated**, checked with
  **mypy (strict)** and linted/formatted with **ruff**. Treat `Any` the way the global rule
  treats TS `any` — avoid it.

## Coding Standards (project)

- **Factory pattern everywhere data enters the system.** All unit/tile/threat/telemetry
  access goes through a factory/provider interface so the source (seed → real → live stream)
  is swappable. Never hard-wire a concrete data source into game logic.
- **Modularity:** parts of the game (units, map, routing, events, supply, optimizer) must be
  independently replaceable. No cross-module reach-through into internals — talk via defined
  interfaces.
- **Error handling:** never swallow errors silently; log with context before re-throwing.
  Python entry points install a global unhandled-exception handler; FastAPI uses structured
  exception handlers.
- **Quality gates (from global):** no file > 300 lines, no function > 50 lines, all tests
  pass and type-checks clean before commit.
- **Secrets:** never commit `.env` or credentials; config via environment variables only.
- **Branching:** never commit to `main`/`master`; always work on a feature branch.

## Testing

- Every test asserts something meaningful — "it loads" is not a success criterion.
- Backend: pytest. Frontend: the framework's standard test runner (e.g. Vitest).
- Simulation logic (fuel burn, routing cost, events) must have deterministic unit tests —
  inject the clock/RNG so real-time and randomness are controllable in tests.

## Frontend patterns (established Wave 3)

- **MapLibre = once-init + imperative source updates.** Create the map exactly once
  (`useEffect(..., [])`), add all sources up front, then push data with
  `(map.getSource(id) as GeoJSONSource).setData(...)` from effects keyed on each data
  slice. **Never** key the map-creation effect on `props` — that rebuilds the whole map on
  every render (re-downloads tiles, drops zoom/pan, breaks realtime). Event handlers read
  the latest props via a ref updated in its own effect, so handlers need not re-register.
- **WebSocket = pure parse/reduce module + thin reconnecting hook.** Put message
  validation and state reduction in a pure, socket-free module (unit-testable with plain
  strings); the hook only owns connection lifecycle (open, reconnect on close, pipe frames
  through the pure functions). Drop malformed frames with a logged warning — never tear
  down the socket on one bad frame.

## API

- Backend routes are versioned under **`/api/v1/`**.

---

## Workflow

This project is developed with **MDD** (`.mdd/`). Build features wave-by-wave:
`/mdd plan-wave battlefuel-wave-1` → `/mdd plan-execute battlefuel-wave-1`. Keep the
initiative and wave docs in sync with reality (`/mdd plan-sync`, `/mdd status`).
