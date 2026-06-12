# BattleFuel

An interactive command game and **decision-support tool for fuel logistics and supply-chain
orchestration** on an offline, real-world map. Plan unit movements, react to battlefield
events, and (later) let an optimization engine advise on routing, refueling, and stock
redistribution — across an **OF-4 (battalion, tactical)** and an **OF-8 (joint force,
supply)** view.

> Built with **MDD** (Manual-Driven Development) — see `.mdd/` for the initiative roadmap,
> wave plans, and per-feature docs. Full product description:
> [`.mdd/initiatives/battlefuel.md`](.mdd/initiatives/battlefuel.md).

## Status

| Wave | Scope | State |
|------|-------|-------|
| 1 | Unit Database & Data Factory | ✅ complete |
| 2 | Offline Map & Grid (Hohenfels, H3 hexes, units) | ✅ complete |
| 3 | Routing & Movement | ⬜ planned |
| 4 | Tiles, Events & Pop-ups | ⬜ planned |
| 5 | Supply Chain & OF-8 View | ⬜ planned |
| 6 | Optimization & Decision Support | ⬜ planned |
| 7 | Deployment (Docker → Hetzner via OpenTofu) | ⬜ planned |

## Stack

- **Backend:** Python 3.12+ / FastAPI, async SQLAlchemy + Alembic
- **Database:** PostgreSQL + PostGIS (Docker)
- **Map:** offline OpenStreetMap → **PMTiles** basemap; **H3** hex grid
- **Frontend:** TypeScript + React + Vite + **MapLibre GL**; APP-6 symbols via `milsymbol`

## Quick start

**Prerequisites:** Docker Desktop, Python 3.12+, Node 20+. (macOS/Linux.)

```bash
# one command — starts db + backend + frontend, applies migrations + seed data
make dev
```

Then open **http://localhost:5173** (API docs at **http://localhost:8000/docs**).
Press **Ctrl+C** to stop the backend & frontend; `make stop` stops the database.

> First run auto-creates the Python venv, installs deps, and seeds the database, so it
> takes a few minutes. Subsequent runs are fast.
>
> The offline basemap (`data/hohenfels.pmtiles`) is committed. To regenerate it from
> OpenStreetMap you'd run `bash backend/scripts/build_basemap.sh` (needs `tippecanoe`).

## Common tasks

```bash
make help     # list all tasks
make dev      # run the full stack
make stop     # stop the database
make test     # backend (pytest) + frontend (vitest)
make lint     # ruff + mypy + eslint
make setup    # first-time deps only (no servers)
make seed     # regenerate hex tiles + demo units
make clean    # remove the db container + volume (DESTROYS data)
```

## What you'll see

A dark map of the **Hohenfels** training area with an **H3 hex grid** (tinted by terrain),
**NATO unit symbols**, and a **click-to-inspect** panel for tiles and units — including a
unit with missing telemetry ("request manual update").

## Project layout

```
battlefuel/
├── backend/      FastAPI app, providers, services, Alembic — see backend/README.md
├── frontend/     React + MapLibre client            — see frontend/README.md
├── data/         offline basemap (hohenfels.pmtiles)
├── scripts/dev.sh  one-command dev launcher
├── docker-compose.yml
├── Makefile
└── .mdd/         MDD docs: initiative, waves, per-feature docs, connections graph
```

## For developers

 Manual deploy commands
```
  Dev (:3001):
  cd /opt/battlefuel
  sudo git pull
  sudo bash deploy/auto-deploy.sh deploy/.env.dev
  
  Prod (:3000):
  cd /opt/battlefuel
  sudo git pull
  sudo bash deploy/auto-deploy.sh deploy/.env.prod
  
  Or the explicit frontend-only form for either env (swap .env.dev / .env.prod):
  cd /opt/battlefuel
  sudo git pull
  sudo docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml pull frontend
  sudo docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml up -d --force-recreate frontend
```


Map data © OpenStreetMap contributors (ODbL).
