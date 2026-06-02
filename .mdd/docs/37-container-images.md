---
id: 37-container-images
title: Container Images — Production Dockerfiles for Backend & Frontend
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-7
wave_status: active
depends_on: []
relates: [38-production-stack, 39-db-persistence-backups, 41-deploy-runbook]
source_files:
  - backend/Dockerfile
  - backend/.dockerignore
  - frontend/Dockerfile
  - frontend/nginx.conf
  - .dockerignore
routes: []
models: []
test_files: []
data_flow: greenfield
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [docker, dockerfile, nginx, deployment, image, backend, frontend, multi-stage]
path: Deploy/Images
integration_contracts: []
satisfies_contracts:
  - from: 38-production-stack
    function: "battlefuel-backend image (uvicorn :8000, /api/v1/health HEALTHCHECK)"
    when: "production-stack's `backend` service builds from backend/Dockerfile and depends on its healthcheck."
    status: done
    verified_at: "backend/Dockerfile:1"
  - from: 38-production-stack
    function: "battlefuel-frontend image (nginx :80, SPA + baked basemap)"
    when: "production-stack's `frontend` service builds from frontend/Dockerfile with VITE_API_BASE/VITE_WS_BASE build args."
    status: done
    verified_at: "frontend/Dockerfile:1"
known_issues:
  - "Base images pinned to major.minor + distro (python:3.12-slim-bookworm, node:22-alpine, nginx:1.27-alpine), not full digests. Pin to digests once a registry is in the deploy loop."
  - "Frontend API/WS base URLs are baked at build time (per-domain image). Runtime injection deferred (Wave-7 Open Research)."
security_read_sites: []
sister_projects: []
---

# 37 — Container Images — Production Dockerfiles for Backend & Frontend

## Purpose
Give every BattleFuel service a self-contained, reproducible production image so the stack
can run anywhere Docker runs. The DB already had an image (`db/Dockerfile`,
PostGIS+pgRouting+osm2pgrouting); this feature adds the **backend** and **frontend** images
and the `.dockerignore` files that keep their build contexts lean. No orchestration here —
just images that build and run on their own (compose wiring is feature 38).

## What was built
- **`backend/Dockerfile`** — multi-stage. *Build stage* (`python:3.12-slim-bookworm`) creates
  a `/opt/venv` and `pip install .` (installs the `[project]` runtime deps + the `app`
  package; dev extras excluded). *Runtime stage* copies the venv into a slim base, adds a
  **non-root `app` user**, and ships the source + `scripts/` + `alembic/` + `alembic.ini`
  (needed so `alembic upgrade head` and the seed scripts run inside this image during
  bootstrap — see feature 39). Runs `uvicorn app.main:app` on `:8000`. **`HEALTHCHECK`** hits
  the real `/api/v1/health` route using stdlib `urllib` (no extra packages).
- **`backend/.dockerignore`** — excludes `.venv`, caches, `tests/`, egg-info, and `.env*`.
- **`frontend/Dockerfile`** — multi-stage. *Build stage* (`node:22-alpine`) runs `npm ci` then
  `npm run build`; the prebuild `sync:assets` step bakes `data/hohenfels.pmtiles` into the
  bundle. **Build context is the repo root** (not `frontend/`) because `sync:assets` resolves
  `../../data`; the Dockerfile copies `data/hohenfels.pmtiles` into the expected path. The
  real domain is injected via **`VITE_API_BASE` / `VITE_WS_BASE` build args**. *Runtime stage*
  serves the static `dist/` with **`nginx:1.27-alpine`**.
- **`frontend/nginx.conf`** — SPA fallback (`try_files … /index.html`), hard caching for
  hashed `/assets/`, and a cache rule for the immutable `/hohenfels.pmtiles` basemap (range
  requests on by default).
- **`.dockerignore` (root)** — governs the frontend (root-context) build: drops VCS, deps,
  build output, secrets (`.env*`, `*.tfvars`), large map intermediates, and `.mdd/`.

## Key decisions
- **Non-root runtime** for the backend (global security rule).
- **Stdlib healthcheck** instead of adding `curl` to keep the image minimal.
- **Build-time URL injection** for the frontend (simplest for Standard scope; same image is
  domain-specific). Runtime injection is noted as deferred research.
- **Frontend served by nginx**, with **Caddy** as the separate TLS edge (feature 38) — keeps
  each image single-purpose.

## How it was verified
- `docker build -f backend/Dockerfile backend` builds clean (multi-stage, non-root, deps incl.
  `ortools` resolve).
- `docker build -f frontend/Dockerfile .` (root context, with `VITE_API_BASE`/`VITE_WS_BASE`
  build args) builds clean; `dist/` includes the baked basemap.
- Both images carry working `HEALTHCHECK`s used by the production stack (38).

## Follow-ups / deferred
- Digest-pin base images once images are pushed to a registry (relates to CI/CD, see `TODO.md`).
- Decide runtime vs build-time frontend config if multi-domain images are ever needed.
