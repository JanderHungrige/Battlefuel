---
id: cicd-deploy-159
title: CI/CD Auto-Deploy to 159.195.148.193 (GHCR + Watchtower, prod/dev)
type: ops
platform: docker-compose + github-actions + watchtower
environments: [production, dev]
deployment_strategy:
  order: parallel
  gate: none
  on_gate_failure: stop
  rollback_on_failure: false
regions:
  - slug: prod
    host: 159.195.148.193:3000
    platform: watchtower
    deploy_order: 1
    role: primary
  - slug: dev
    host: 159.195.148.193:3001
    platform: watchtower
    deploy_order: 1
    role: dev
services:
  - slug: frontend
    image: ghcr.io/janderhungrige/battlefuel-frontend
    port: 3000/3001
    health_check: "GET / -> 200"
    regions: { prod: { status: unknown }, dev: { status: unknown } }
  - slug: backend
    image: ghcr.io/janderhungrige/battlefuel-backend
    port: ~
    health_check: "GET /api/v1/health -> 200 (proxied via frontend)"
    regions: { prod: { status: unknown }, dev: { status: unknown } }
  - slug: db
    image: ghcr.io/janderhungrige/battlefuel-db
    port: ~
    health_check: "pg_isready"
    regions: { prod: { status: unknown }, dev: { status: unknown } }
status: draft
last_synced: 2026-06-02
mdd_version: 11
tags: [cicd, github-actions, watchtower, ghcr, docker-compose, npm, deploy, prod, dev]
known_issues:
  - "Fully automatic prod deploy on merge to main (no approval gate) — by request."
  - "Seed .osm extracts are gitignored; the host needs data/ (rsync once) for first-time bootstrap."
---

# CI/CD Auto-Deploy to 159.195.148.193 (GHCR + Watchtower)

## Overview
Push-to-deploy with no SSH from CI. GitHub Actions builds images and pushes them to GHCR;
**Watchtower** on the host polls GHCR and auto-recreates the changed services.

```
merge -> main           CI builds & pushes :main  -> Watchtower(prod) -> stack on :3000
push  -> dev-deployment CI builds & pushes :dev   -> Watchtower(dev)  -> stack on :3001
```

**Nginx Proxy Manager (NPM)** terminates TLS and routes the domains (enable *Websockets
Support* on both proxy hosts):
- `battlefuel.jeanquestenterprise.de`     -> `159.195.148.193:3000`
- `battlefuel-dev.jeanquestenterprise.de` -> `159.195.148.193:3001`

The SPA calls the API **same-origin** (`/api/v1`, WS scheme derived from the page), so one
frontend image works for any domain/TLS.

## Services & Ports
| Service  | Image (`:main` prod / `:dev` dev)           | Exposed | Health |
|----------|----------------------------------------------|---------|--------|
| frontend | ghcr.io/janderhungrige/battlefuel-frontend   | :3000 / :3001 | `GET /` |
| backend  | ghcr.io/janderhungrige/battlefuel-backend    | internal | `/api/v1/health` (via frontend) |
| db       | ghcr.io/janderhungrige/battlefuel-db         | internal | `pg_isready` |
| watchtower | containrrr/watchtower (one per env, scoped) | internal | — |

## Credentials & Secrets
| What | Where | Notes |
|------|-------|-------|
| GHCR push | GitHub `GITHUB_TOKEN` (built-in) | workflow `permissions: packages: write` — nothing to configure |
| GHCR pull (host) | `/root/.docker/config.json` | one-time `docker login ghcr.io` with a `read:packages` PAT (private images) |
| DB passwords | `deploy/.env.prod` / `deploy/.env.dev` on host | gitignored; never committed |

## How CI works
`.github/workflows/deploy.yml` runs on push to `main` and `dev-deployment`:
builds + pushes `battlefuel-{backend,frontend,db}` to GHCR tagged `:main` or `:dev` (and
`:<sha>`). Frontend is built with `VITE_API_BASE=/api/v1` (same-origin). No SSH, no deploy
step in CI — Watchtower does the rollout.

## One-time host setup (159.195.148.193)
1. Install Docker Engine + compose plugin.
2. `docker login ghcr.io` (username = GitHub user, password = a `read:packages` PAT) so
   Watchtower can pull private images. Confirms `/root/.docker/config.json` exists.
3. Get the repo + seed data onto the host:
   ```bash
   git clone https://github.com/JanderHungrige/Battlefuel.git /opt/battlefuel
   cd /opt/battlefuel
   # Seed .osm extracts are gitignored — copy them from your dev machine once:
   #   rsync -av data/hohenfels.osm data/hohenfels-roads.osm root@159.195.148.193:/opt/battlefuel/data/
   mkdir -p data-prod/pgdata data-dev/pgdata
   ```
4. Create the env files from templates and fill real values:
   ```bash
   cp deploy/.env.prod.example deploy/.env.prod   # strong DB password, etc.
   cp deploy/.env.dev.example  deploy/.env.dev
   ```
5. Bring up both stacks:
   ```bash
   docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml up -d
   docker compose --env-file deploy/.env.dev  -f deploy/compose.app.yml up -d
   ```
6. First-time data bootstrap per stack (migrate is automatic on backend start; this adds the
   OSM import, tile/unit/supply seed, and routing graph):
   ```bash
   COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.prod bash scripts/prod-bootstrap.sh
   COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.dev  bash scripts/prod-bootstrap.sh
   ```
7. In **NPM**: add two proxy hosts (domains above → `159.195.148.193:3000` / `:3001`),
   enable **Websockets Support**, request TLS certs.

## Deployment Procedure (steady state)
Step 1 (Deploy prod):
  Action:  merge a PR into `main`
  Verify:  GitHub Actions `build-and-push` green; within ~1 min `curl -fsS https://battlefuel.jeanquestenterprise.de/api/v1/health` -> `{"status":"ok"}`

Step 2 (Deploy dev):
  Action:  push to `dev-deployment`
  Verify:  `curl -fsS https://battlefuel-dev.jeanquestenterprise.de/api/v1/health` -> 200

## Rollback Plan
1. **App regression:** re-point the env to a known-good image SHA tag and recreate:
   on host, set `IMAGE_TAG=<good-sha>` in `deploy/.env.prod` then
   `docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml up -d backend frontend`.
   (CI pushes a `:<sha>` tag for every build, so any past build is recoverable.) Then revert
   the bad commit on `main` so Watchtower doesn't re-pull the broken `:main`.
2. **Bad migration / data:** restore a dump with `scripts/restore.sh` (run with
   `COMPOSE_FILE=deploy/compose.app.yml BATTLEFUEL_ENV_FILE=deploy/.env.prod`), then redeploy
   the matching image SHA.
3. **Stop auto-deploy temporarily:** `docker compose --env-file deploy/.env.prod -f deploy/compose.app.yml stop watchtower`.
