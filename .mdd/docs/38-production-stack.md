---
id: 38-production-stack
title: Production Stack — Compose + Caddy TLS Edge (HTTP + WebSocket)
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-7
wave_status: active
depends_on: [37-container-images]
relates: [39-db-persistence-backups, 40-opentofu-hetzner, 41-deploy-runbook]
source_files:
  - compose.prod.yml
  - Caddyfile
  - .env.example
  - backend/pyproject.toml
routes:
  - "GET / (SPA via Caddy -> frontend)"
  - "ANY /api/v1/* (via Caddy -> backend:8000, incl. WebSocket upgrade)"
models: []
test_files: []
data_flow: reads-existing
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [docker-compose, caddy, tls, reverse-proxy, websocket, deployment, production, letsencrypt]
path: Deploy/Stack
integration_contracts:
  - function: "battlefuel-backend / battlefuel-frontend images (feature 37)"
    when: "compose.prod.yml builds the backend from backend/Dockerfile and the frontend from frontend/Dockerfile (root context) with VITE_API_BASE/VITE_WS_BASE build args."
    consumers: []
satisfies_contracts:
  - from: 39-db-persistence-backups
    function: "db service + battlefuel-db-data volume + ./data mount"
    when: "feature 39 binds battlefuel-db-data to the Hetzner block volume and adds the bootstrap/backup tooling on top of this topology."
    status: pending
    verified_at: ""
  - from: 41-deploy-runbook
    function: "compose.prod.yml as the deploy unit (docker compose -f compose.prod.yml up -d)"
    when: "the deploy script ships this file + .env to the host and runs it."
    status: done
    verified_at: "scripts/deploy.sh"
known_issues:
  - "Public TLS requires a real domain with DNS pointing at the host; localhost cannot obtain a Let's Encrypt cert (Caddy uses its internal CA for non-public names)."
  - "Frontend URLs are build-time args, so the image is domain-specific (rebuild per environment)."
security_read_sites: []
sister_projects: []
---

# 38 — Production Stack — Compose + Caddy TLS Edge

## Purpose
Wire the Wave-7 images (37) and the existing DB image into one runnable production stack:
**db + backend + frontend behind a Caddy TLS edge**, on a real domain, with HTTP **and the
WebSocket sim/event channel** both routed. Kept separate from the dev `docker-compose.yml`
(which stays DB-only).

## What was built
- **`compose.prod.yml`** — four services on the internal compose network:
  - **db** — the existing `battlefuel-db` PostGIS+pgRouting image; `pg_isready` healthcheck;
    `battlefuel-db-data` named volume (feature 39 binds it to the block volume); `./data`
    mounted read-only for the routing-graph bootstrap. No published ports.
  - **backend** — built from `backend/Dockerfile`; `depends_on: db (service_healthy)`;
    config via `BATTLEFUEL_*` env; **`command` runs `alembic upgrade head` then `uvicorn`** so
    migrations apply (idempotently) before serving. Image `HEALTHCHECK` hits `/api/v1/health`.
    Internal only.
  - **frontend** — built from `frontend/Dockerfile` (root context) with `VITE_API_BASE` /
    `VITE_WS_BASE` build args from `.env`. Serves the SPA on `:80` internally.
  - **caddy** — `caddy:2-alpine` edge on `:80`/`:443`; **automatic Let's Encrypt TLS**;
    persistent `caddy-data` (ACME certs) + `caddy-config` volumes.
  - All services `restart: unless-stopped`. Every secret/value comes from the root `.env`
    (compose uses `${VAR:?}` to fail fast if a required var is missing).
- **`Caddyfile`** — for `{$BATTLEFUEL_DOMAIN}`: `/api/v1/*` → `backend:8000` (Caddy proxies the
  **WebSocket Upgrade transparently** — no special config), everything else → `frontend:80`;
  `tls {$BATTLEFUEL_ACME_EMAIL}`; `encode zstd gzip`.
- **`.env.example`** — template for every var the dev and prod stacks read (DB creds,
  `BATTLEFUEL_DATABASE_URL`, JSON-array `BATTLEFUEL_CORS_ORIGINS`, domain, ACME email, Vite
  build args). `.env` stays gitignored.

## Bug found & fixed (dependency gap)
A clean production image install surfaced a **latent missing dependency**: the backend imports
`h3` in 7 modules but `h3` was **never declared in `backend/pyproject.toml`** (it had been
pip-installed ad hoc in the dev venv; `pip show` reported `Required-by:` empty). The container
crash-looped with `ModuleNotFoundError: No module named 'h3'`. **Fix:** added `h3>=4.4` to
`[project].dependencies` (matches the frontend's `h3-js ^4.4.0`; dev had 4.5.0). This is the
kind of gap only a from-scratch install catches.

## How it was verified
Full stack brought up locally in an isolated compose project (fresh volumes):
- **backend** reached `healthy`; `alembic upgrade head` ran on boot; `GET /api/v1/health` →
  `200 {"status":"ok"}`.
- **frontend** served `/`, `/hohenfels.pmtiles`, and SPA-fallback routes → all `200`.
- **Caddy** routing validated over the compose network: `/` → frontend, `/api/v1/health` →
  backend, basemap, and SPA fallback all `200`; `http://` → `https` `308` redirect.
- `docker compose -f compose.prod.yml config` validates; `caddy validate` passes.
- (Public TLS issuance needs a real domain — exercised in the deploy runbook, feature 41, not
  against localhost.)

## Notes / decisions
- **Migrate on boot, seed on demand:** migrations are idempotent and safe to run every start;
  seeding + routing-graph build are a deliberate one-time bootstrap (feature 39 / deploy
  script), not run on every container start.
- **Reverse proxy = Caddy** (auto-TLS, transparent WS) — resolves the Wave-7 "reverse proxy
  choice" open research item.
