# BattleFuel — Backend

FastAPI service for BattleFuel, a fuel-logistics command game. See
[`../CLAUDE.md`](../CLAUDE.md) for project-wide rules and
[`../.mdd/initiatives/battlefuel.md`](../.mdd/initiatives/battlefuel.md) for the roadmap.

**Status:** Wave 1 (Unit Database & Data Factory) complete. Exposes a read-only NATO
unit-type catalog over `/api/v1`. Runs with **no database** — the catalog is served from
a bundled seed provider behind a swappable factory.

## Requirements

- Python ≥ 3.12 (developed on 3.13)
- No database needed for Wave 1.

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"            # runtime + dev tools (pytest, mypy, ruff)
```

## Run the server

```bash
# from backend/, with the venv active
uvicorn app.main:app --reload --port 8000
```

- API base: `http://localhost:8000/api/v1`
- Interactive docs (Swagger UI): `http://localhost:8000/docs`
- OpenAPI schema: `http://localhost:8000/openapi.json`

Quick check:

```bash
curl -s localhost:8000/api/v1/health
# {"status":"ok"}
```

## Configuration

Settings come from environment variables prefixed with `BATTLEFUEL_` (or a local `.env`).
Copy the template and adjust as needed — **never commit `.env`**:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|----------|---------|---------|
| `BATTLEFUEL_UNIT_PROVIDER` | `seed` | Which data provider the factory builds. Wave 1 ships only `seed`; future providers (PostgreSQL, live streams) register under their own names and are selected here with no code change. |

## API (Wave 1)

| Method & path | Description |
|---------------|-------------|
| `GET /api/v1/health` | Liveness check → `{"status":"ok"}` |
| `GET /api/v1/units` | List all unit types. Optional filters: `nato_unit_type`, `echelon` (enum values; invalid → `422`) |
| `GET /api/v1/units/{unit_id}` | Fetch one unit type by id → `200`, or `404` if unknown |

Examples:

```bash
curl -s localhost:8000/api/v1/units | python -m json.tool
curl -s "localhost:8000/api/v1/units?nato_unit_type=fuel_supply"
curl -s "localhost:8000/api/v1/units?echelon=company"
curl -s localhost:8000/api/v1/units/armor-tank-coy
```

Each unit includes nested `fuel`, `movement`, and `combat` profiles plus computed
`endurance_hours_normal` / `endurance_hours_combat` (`null` when the unit has no fuel
demand). All stat values are **illustrative/approximate**, not authoritative.

## Quality gates

Run from `backend/` with the venv active. All three must pass before committing.

```bash
pytest               # test suite (33 tests in Wave 1)
mypy app             # strict type checking
ruff check .         # lint
ruff format .        # auto-format
```

## Project layout

```
backend/
├── pyproject.toml          # deps + ruff/mypy/pytest config
├── .env.example
├── app/
│   ├── config.py           # Settings (env-driven provider selection)
│   ├── main.py             # create_app() — mounts /api/v1
│   ├── domain/
│   │   └── unit.py         # UnitType model + enums (Feature 1)
│   ├── providers/
│   │   ├── base.py         # UnitDataProvider interface (Feature 2)
│   │   ├── factory.py      # registry + build_unit_provider() (Feature 2)
│   │   ├── seed.py         # SeedUnitProvider, self-registers as "seed" (Feature 3)
│   │   └── seed_data.py    # the seeded NATO catalog (Feature 3)
│   └── api/
│       └── units.py        # /units endpoints (Feature 4)
└── tests/                  # one test module per feature
```

### Architecture notes

- **Factory swap point.** Consumers depend on the `UnitDataProvider` interface and obtain
  an instance via `build_unit_provider()` — never by importing a concrete provider. New
  data sources register themselves (`register_provider`) and are chosen by config; no
  consumer changes.
- **Providers self-register on import** (`app/providers/__init__.py` imports `seed`).
- **Routes use `Annotated[..., Depends()]`** for dependencies/query params (not
  call-in-argument-default), keeping ruff `B008` happy and matching modern FastAPI style.
