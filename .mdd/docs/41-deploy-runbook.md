---
id: 41-deploy-runbook
title: Deploy Runbook — Scripted, Explicit Deploy + Ops Procedures
edition: MDD
initiative: battlefuel
wave: battlefuel-wave-7
wave_status: active
depends_on: [38-production-stack, 39-db-persistence-backups, 40-opentofu-hetzner]
relates: [37-container-images]
source_files:
  - scripts/deploy.sh
  - Makefile
  - scripts/prod-bootstrap.sh
  - scripts/backup.sh
  - scripts/restore.sh
  - deploy/crontab.example
  - .env.example
  - .mdd/ops/deploy-hetzner.md
routes: []
models: []
test_files: []
data_flow: reads-existing
last_synced: 2026-06-02
status: complete
phase: all
mdd_version: 11
tags: [deploy, runbook, makefile, ssh, rsync, ops, rollback, hetzner, docker-compose]
path: Deploy/Runbook
integration_contracts: []
satisfies_contracts:
  - from: 38-production-stack
    function: "ship + run compose.prod.yml on the host"
    when: "deploy.sh rsyncs the project and runs `docker compose -f compose.prod.yml up -d`."
    status: done
    verified_at: "scripts/deploy.sh"
  - from: 40-opentofu-hetzner
    function: "consume tofu outputs (floating_ipv4) as the deploy target"
    when: "deploy.sh reads `tofu output -raw floating_ipv4` when DEPLOY_HOST is unset."
    status: done
    verified_at: "scripts/deploy.sh"
known_issues:
  - "deploy.sh performs live SSH/rsync to a real host + `tofu apply`; not executable in the build sandbox. Verified by syntax + dry-run + component tests; full run happens at real deploy time."
  - "Image distribution = build-on-host (rsync source). Registry-based push/pull + CI/CD auto-deploy are deferred (TODO.md)."
security_read_sites: []
sister_projects: []
---

# 41 — Deploy Runbook — Scripted, Explicit Deploy + Ops Procedures

## Purpose
Tie features 37–40 into a **single, explicit, human-invoked deploy** and capture the full
operational procedure (provision, deploy, redeploy, backup, rollback, restore) as an MDD ops
runbook. **Never auto-deploys** — honors the global "wait for explicit yes" rule.

## What was built
- **`scripts/deploy.sh`** — the deploy orchestrator:
  1. resolve the host (`DEPLOY_HOST`, else `tofu output -raw floating_ipv4`)
  2. preflight (`.env` exists, Docker reachable over SSH)
  3. `rsync` the project + `data/` + `.env` to `/opt/battlefuel` (excludes git/deps/caches/
     state/`.mdd`)
  4. on the host: `docker compose build` + `up -d`
  5. **first-time bootstrap only if the DB has no tiles** (idempotent guard), else skip
  6. **smoke check** `https://$DOMAIN/api/v1/health`.
- **Makefile targets** — `provision` (`tofu apply`), `deploy`, `prod-bootstrap`, `backup`,
  `restore FILE=…`, `prod-logs`, `prod-down`.
- **`.mdd/ops/deploy-hetzner.md`** — the runbook: prerequisites, services/ports, credentials
  (names only), step-by-step procedure with per-step verifications, redeploy, and a 4-case
  **rollback plan** (app regression, bad migration/restore, host failure/volume re-attach,
  full teardown).
- **Ops-script hardening** (carried into 39's scripts): `prod-bootstrap.sh` / `backup.sh` /
  `restore.sh` now **auto-source `.env`** (via `BATTLEFUEL_ENV_FILE`) so they run standalone on
  the host; `.env.example` **single-quotes `BATTLEFUEL_CORS_ORIGINS`** so the JSON survives both
  shell sourcing and compose `--env-file`; `crontab.example` simplified accordingly.

## Key decisions
- **Build-on-host** (rsync source) for Standard scope — simplest, no registry. Registry
  push/pull is the natural CI/CD evolution (deferred, `TODO.md`).
- **Bootstrap is guarded** (runs only on an empty DB), so redeploys are safe and fast.
- **Deploy is explicit** (`make deploy`) — no triggers, webhooks, or auto-runs.

## How it was verified
- `bash -n` clean on `deploy.sh` + all ops scripts; `make help` lists the new targets;
  `make -n deploy` resolves to `bash scripts/deploy.sh`.
- The single-quoted `CORS_ORIGINS` round-trips: sourced into bash then `json.loads` parses it.
- Underlying steps were exercised live in features 38–40 (compose up, bootstrap incl. OSM
  import + routing graph, backup/restore round-trip, `tofu validate`). `deploy.sh` itself does
  live SSH/rsync + `tofu apply`, which run at real deploy time (not in the sandbox).

## Follow-ups / deferred
- CI/CD auto-deploy pipeline + monitoring/alerting — see `TODO.md`.
- Optional offsite backup replication and remote OpenTofu state.
