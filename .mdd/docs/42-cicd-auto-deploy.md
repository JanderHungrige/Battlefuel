---
id: 42-cicd-auto-deploy
title: CI/CD Auto-Deploy — GitHub Actions + GHCR + Watchtower (prod/dev on 159.x)
edition: MDD
initiative: battlefuel
wave: null
wave_status: standalone
depends_on: [37-container-images, 38-production-stack]
relates: [39-db-persistence-backups, 41-deploy-runbook]
source_files:
  - .github/workflows/deploy.yml
  - deploy/compose.app.yml
  - deploy/.env.prod.example
  - deploy/.env.dev.example
  - deploy/auto-deploy.sh
  - deploy/crontab.example
  - frontend/nginx.conf
  - frontend/src/config.ts
  - .mdd/ops/cicd-deploy-159.md
routes:
  - "ANY /api/v1/* (frontend nginx -> backend:8000, incl. WebSocket)"
models: []
test_files:
  - frontend/src/api/client.test.ts
data_flow: greenfield
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [cicd, github-actions, ghcr, cron, docker-compose, nginx-proxy-manager, same-origin, deploy]
path: Deploy/CICD
integration_contracts: []
satisfies_contracts: []
known_issues:
  - "Prod deploys fully automatically on merge to main (no approval gate) — by explicit request, overriding the default never-auto-deploy caution."
  - "Rollout is a host cron (deploy/auto-deploy.sh), NOT Watchtower — containrrr/watchtower is unmaintained and its bundled Docker client (v1.25) is incompatible with Docker Engine 24+ (min API 1.40)."
  - "Supersedes the Wave-7 Hetzner/OpenTofu manual deploy as the active target; infra/ + compose.prod.yml kept as reference."
  - "Local docker compose v2.2.1 mishandled :? in port/volume short-syntax and --env-file; verified via docker run + `docker compose config`. Host runs modern compose."
security_read_sites: []
sister_projects: []
---

# 42 — CI/CD Auto-Deploy — GitHub Actions + GHCR + host-cron rollout

## Purpose
Push-to-deploy BattleFuel to `159.195.148.193`: merges to `main` ship to **prod (:3000)** and
pushes to `dev-deployment` ship to **dev (:3001)** — automatically, with no SSH from CI. This
realises the CI/CD item deferred from Wave 7 (`TODO.md`), on a plain-port host fronted by the
user's **Nginx Proxy Manager** for TLS/domains.

## Architecture
- **CI** (`.github/workflows/deploy.yml`): on push to `main`/`dev-deployment`, build + push
  `battlefuel-{backend,frontend,db}` to `ghcr.io/janderhungrige` tagged `:main`/`:dev` (+`:sha`).
  Auth via the built-in `GITHUB_TOKEN` (`packages: write`). No deploy step in CI.
- **Host rollout** — a **cron** runs `deploy/auto-deploy.sh <env-file>` every minute per env:
  `docker compose pull backend frontend` + `up -d backend frontend` (db left alone). It uses
  the **host Docker**, so there's no client/API mismatch. (Watchtower was the original plan but
  `containrrr/watchtower` is unmaintained and ships a Docker client too old for Engine 24+.)
  `deploy/compose.app.yml` is one parametrised env, run twice with `.env.prod` / `.env.dev`.
- **Same-origin frontend**: `frontend/nginx.conf` now serves the SPA **and** proxies `/api/v1`
  (+ WebSocket) to `backend:8000`, so a single published port (`:3000`/`:3001`) is the whole
  app. `frontend/src/config.ts` defaults `VITE_API_BASE=/api/v1` and derives the WS scheme/host
  from `window.location` — so one image works on any domain/TLS (no per-env rebuild).
- **NPM** (external) terminates TLS and routes `battlefuel.jeanquestenterprise.de` → `:3000`,
  `battlefuel-dev.jeanquestenterprise.de` → `:3001` (Websockets Support on).

## Key decisions
- **GHCR + host-cron pull** over SSH-push: no deploy credentials in CI; the host pulls.
- **Same-origin relative API**: avoids baking domains into the image and avoids mixed-content
  behind NPM's TLS. (Resolves the Wave-7 "build-time vs runtime frontend URL" open question.)
- **Per-`sha` image tags** kept for instant rollback to any past build.
- **NPM, not Caddy**, for TLS — the user already runs NPM; no edge proxy shipped here.

## How it was verified
- Built all three images with the GHCR tags; ran backend+frontend via `docker run` against the
  seeded DB: `GET /` 200, **`GET /api/v1/health` 200 `{"status":"ok"}` proxied through nginx**,
  `/api/v1/unit-instances` 200, basemap 200, SPA fallback 200. CORS value
  `["https://battlefuel-dev.jeanquestenterprise.de"]` parsed (backend healthy).
- `frontend` test suite: **90 passed** (config.ts change safe).
- `.github/workflows/deploy.yml` YAML valid (1 job, 8 steps); `docker compose -f deploy/compose.app.yml config` valid.
- Full `tofu apply` / live host deploy is performed via the ops runbook (`.mdd/ops/cicd-deploy-159.md`),
  not in the build sandbox.

## Follow-ups / deferred
- Optional manual-approval gate on prod (GitHub Environments) if auto-deploy proves too eager.
- Health/uptime monitoring + alerting (still in `TODO.md`).
