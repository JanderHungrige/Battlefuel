---
id: battlefuel-wave-7
title: "Wave 7: Deployment — Dockerized Stack on Hetzner via OpenTofu"
initiative: battlefuel
initiative_version: 5
status: planned
depends_on: battlefuel-wave-6
demo_state: "Provision a Hetzner Cloud host with OpenTofu (server, firewall, block volume, floating IP) and run the full BattleFuel stack on it via Docker Compose — Postgres+PostGIS+pgRouting, the FastAPI backend, and the React/MapLibre frontend — behind a reverse proxy with automatic TLS on a real domain (HTTP + WebSocket). Game data lives on a persistent volume with automated backups. A single scripted, explicitly-invoked deploy (tofu apply + ship the stack over SSH; nothing auto-deploys) brings it up; visiting the domain serves the app and the live sim works end-to-end. CI/CD auto-deploy and monitoring are deferred (see TODO.md)."
created: 2026-06-02
hash: ce209d46
---

# Wave 7: Deployment — Dockerized Stack on Hetzner via OpenTofu

## Demo-State
**Run the whole system in production.** OpenTofu provisions a **Hetzner Cloud** host
(server, firewall, block volume, floating IP, SSH key) from code. A **production Docker
Compose** stack runs there — **Postgres+PostGIS+pgRouting**, the **FastAPI backend**, and
the **React/MapLibre frontend** — behind a **reverse proxy with automatic TLS** on a real
domain, with **HTTP and WebSocket** both working. Game state sits on a **persistent volume
with automated backups**. Deployment is a **single, explicit, scripted action** (`tofu apply`
then ship the stack over SSH and `compose up` — **never auto-deploys**); afterwards, visiting
the domain serves the app and the live sim clock runs end-to-end.
*(This wave is not complete until this can be manually demonstrated: a fresh `tofu apply` +
deploy script produces a reachable, TLS-served, working BattleFuel at the domain.)*

## Scope
Waves 1–6 built the full application (units, offline map, movement, dynamic battlefield, OF-8
supply, optimization advisor) running on the **local dev compose** (DB-only) plus host-run
backend/frontend. Wave 7 makes it **deployable and deployed**: containerize every service, add
a **production** compose with TLS, provision the host with **OpenTofu**, and ship it with an
**explicit scripted deploy**.

**In scope (Standard):**
- Production **Dockerfiles** for backend and frontend (the DB image already exists at `db/`).
- A **production Compose** stack: db + backend + frontend + reverse proxy, with healthchecks,
  restart policies, and env from a host `.env`.
- **Reverse proxy + automatic TLS** on a real domain, with **WebSocket passthrough** for the
  sim clock / event channel and `/api/v1/` routing to the backend.
- **Persistent Postgres+PostGIS** storage on a Hetzner **block volume**, first-boot
  **migrate + seed**, and **automated backups** with retention.
- **OpenTofu (hcloud)** infrastructure as code: server, firewall, volume, floating IP, SSH
  keys, cloud-init bootstrap. Secrets via **gitignored `*.auto.tfvars`** — never in git.
- A **scripted manual deploy** (Makefile/script targets) and an **MDD ops runbook**.

**Locked inputs (initiative):** Python/FastAPI backend, React + MapLibre frontend,
PostgreSQL + PostGIS + pgRouting, factory-pattern data layer, continuous real-time sim over
WebSockets, single-user server-authoritative. **Deploy decision (this wave):** Docker →
Hetzner via **OpenTofu**.

**Deferred (see `TODO.md`):** CI/CD auto-deploy pipeline (GitHub Actions, approval-gated);
health/uptime monitoring + alerting. **Out of scope (later milestone):** ML predictions;
auto-execution of advice; multi-host / multi-user scale-out.

## Features
| # | Feature | Doc | Status | Depends on |
|---|---------|-----|--------|------------|
| 1 | container-images        | docs/37-container-images.md | complete | — |
| 2 | production-stack        | docs/38-production-stack.md | complete | container-images |
| 3 | db-persistence-backups  | docs/39-db-persistence-backups.md | complete | production-stack |
| 4 | opentofu-hetzner        | docs/40-opentofu-hetzner.md | complete | — |
| 5 | deploy-runbook          | docs/41-deploy-runbook.md | complete | production-stack, db-persistence-backups, opentofu-hetzner |

Build order: (1, 4 can start in parallel) → 2 (after 1) → 3 (after 2) → 5 (after 2, 3, 4).

### Feature notes
- **container-images** — Production **Dockerfiles** for the backend (multi-stage: build wheels
  → slim runtime, run `uvicorn`, **non-root** user, `HEALTHCHECK` hitting the FastAPI health
  route) and the frontend (build with Vite → serve the static `dist/`, env-injected API/WS
  base URL at build or runtime). Add `.dockerignore` for both. **Confirm `ortools` + PostGIS
  client wheels** exist for the chosen target arch (carry over the Wave-6 packaging note) and
  **pin the base images**. No orchestration yet — just images that build and run individually.
- **production-stack** — A **production Compose** file (a `compose.prod.yml` / override, kept
  separate from the dev `docker-compose.yml`) wiring **db + backend + frontend + reverse
  proxy**. Reuses the existing `db/` image. Adds a **reverse proxy with automatic TLS**
  (Let's Encrypt) terminating a real **domain**, routing `/` → frontend and `/api/v1/` →
  backend, and **passing through WebSocket upgrades** for the sim channel. Healthchecks,
  `restart: unless-stopped`, dependency ordering (`depends_on` + healthcheck conditions), and
  **all secrets/config from a host `.env`** (no literals in the compose file). Bring-up order
  runs **migrate then seed** before the backend serves.
- **db-persistence-backups** — Bind the Postgres data dir to a **Hetzner block volume** (and a
  named volume locally) so game state survives redeploys; **first-boot bootstrap** runs Alembic
  **migrate** + the **seed** (idempotent). **Automated backups**: scheduled `pg_dump` (cron /
  sidecar) to the mounted volume (and optionally offsite — see Open Research) with a
  **retention policy**, plus a documented, **tested restore** path. Verifies durability across
  a container recreate.
- **opentofu-hetzner** — An **OpenTofu** config (`infra/` or `deploy/tofu/`) using the
  **`hcloud` provider** to provision: a server (sized for the stack), a **firewall** (only
  22/80/443, SSH locked down), a **block volume** for DB data, a **floating IP**, and the
  **SSH key**. **cloud-init** installs Docker + Compose and prepares the deploy dir. Variables
  for region/size/domain/SSH key; **secrets in a gitignored `*.auto.tfvars`**, with a
  committed **`*.tfvars.example`**. Decide and document the **state backend** (local vs remote
  — see Open Research). Outputs the host IP for the deploy script.
- **deploy-runbook** — A **scripted, explicit deploy** (Makefile + `scripts/deploy.sh`): run
  `tofu apply`, **ship images** (build-on-host or push/pull — see Open Research), copy
  `compose.prod.yml` + the production **`.env`** to the host over SSH, run **migrate + seed**,
  `compose up -d`, and a **post-deploy smoke check** (TLS reachable, `/api/v1` healthy, WS
  connects). **Honors the never-auto-deploy rule** — deploy only runs when a human invokes it.
  Capture the whole procedure as an **MDD ops runbook** (`/mdd ops`) including first-time
  provisioning, redeploy, rollback, and restore-from-backup.

## Open Research
- **Reverse proxy choice** — Caddy (simplest auto-TLS, tiny config) vs Traefik (label-driven,
  CI-friendly) vs nginx + certbot. Must cleanly proxy **WebSocket upgrades** and `/api/v1/`.
  Pick one and pin it.
- **Frontend serving** — static `dist/` served by the reverse proxy directly vs a dedicated
  nginx container; and **build-time vs runtime injection** of the API/WS base URL (so the same
  image works across domains/envs).
- **Target architecture & sizing** — Hetzner Cloud **arm64 (CAX) vs amd64 (CPX)**, server
  size, and region; confirm **`ortools` and PostGIS/pgRouting** images/wheels are available for
  the chosen arch before committing (carry-over from Wave 6).
- **OSM seed data delivery** — how the pre-packaged **seed theater** (OSM extract / PMTiles in
  `data/`) reaches the host (baked into an image vs shipped to the volume) and its size impact
  on images/transfer.
- **Backups: storage & retention** — local block volume only vs **offsite** (Hetzner Storage
  Box / S3-compatible); retention window; how restore is exercised and verified.
- **OpenTofu state backend** — local state file (simple, single-operator) vs remote (S3-compat
  / object storage) for safety; how state secrets are protected. Single-user MVP likely local,
  but decide explicitly.
- **Domain & DNS** — registrar/DNS setup; **manual DNS records** vs OpenTofu-managed (Hetzner
  DNS provider); TLS issuance dependency on DNS being live first.
- **Production secrets** — generating a strong prod DB password and any API tokens, getting the
  `.env` to the host securely (cloud-init vs SSH copy at deploy), and keeping them out of git
  and OpenTofu state where possible.
- **Image distribution** — build images **on the host** vs build locally / in future CI and
  **push to a registry** (e.g. GHCR) then pull; affects deploy speed and the eventual CI/CD
  path (deferred).
