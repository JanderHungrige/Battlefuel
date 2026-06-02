---
id: deploy-hetzner
title: Deploy BattleFuel to Hetzner Cloud (OpenTofu + Docker Compose)
type: ops
platform: hetzner-cloud
environments: [production]
deployment_strategy:
  order: sequential
  gate: health_check
  on_gate_failure: stop
  rollback_on_failure: false
regions:
  - slug: hetzner-prod
    host: floating-ip (from tofu output)
    platform: hetzner-cloud
    deploy_order: 1
    role: primary
services:
  - slug: db
    image: battlefuel-db:16-3.4-pgrouting
    port: ~
    health_check: "pg_isready -U $BATTLEFUEL_DB_USER"
    regions:
      hetzner-prod: { status: unknown, last_checked: ~ }
  - slug: backend
    image: battlefuel-backend:prod
    port: 8000
    health_check: "GET /api/v1/health -> 200"
    regions:
      hetzner-prod: { status: unknown, last_checked: ~ }
  - slug: frontend
    image: battlefuel-frontend:prod
    port: 80
    health_check: "GET / -> 200"
    regions:
      hetzner-prod: { status: unknown, last_checked: ~ }
  - slug: caddy
    image: caddy:2-alpine
    port: 443
    health_check: "GET https://$BATTLEFUEL_DOMAIN/api/v1/health -> 200"
    regions:
      hetzner-prod: { status: unknown, last_checked: ~ }
status: draft
last_synced: 2026-06-02
mdd_version: 11
tags: [deploy, hetzner, opentofu, docker-compose, caddy, postgis, production, rollback]
known_issues:
  - "TLS issuance requires DNS A record -> floating IP to be live before the first deploy."
  - "Image distribution = build-on-host (no registry yet); CI/CD auto-deploy deferred (TODO.md)."
---

# Deploy BattleFuel to Hetzner Cloud (OpenTofu + Docker Compose)

## Overview
Provisions a Hetzner Cloud host with OpenTofu and runs the full BattleFuel stack on it via
Docker Compose behind a Caddy TLS edge. Deployment is **explicit and human-invoked** — nothing
auto-deploys (honors the global "never auto-deploy" rule). Single primary region.

## Services & Ports
| Service  | Image                          | Port | Health |
|----------|--------------------------------|------|--------|
| db       | battlefuel-db:16-3.4-pgrouting | —    | `pg_isready` |
| backend  | battlefuel-backend:prod        | 8000 (internal) | `/api/v1/health` 200 |
| frontend | battlefuel-frontend:prod       | 80 (internal)   | `/` 200 |
| caddy    | caddy:2-alpine                 | 80/443 (public) | `https://$DOMAIN/api/v1/health` 200 |

## Environment Targets
Production only, single Hetzner Cloud host. Infra in `infra/` (OpenTofu); app config in root
`.env` (from `.env.example`).

## Webhooks & Triggers
None. Deploy is triggered manually: `make deploy` (or `bash scripts/deploy.sh`).

## Credentials & API Keys
| Credential | Env var / location | Where stored |
|-----------|--------------------|--------------|
| Hetzner API token | `hcloud_token` | `infra/secrets.auto.tfvars` (gitignored) |
| SSH private key | local `~/.ssh/…` | developer machine |
| DB password | `BATTLEFUEL_DB_PASSWORD` | root `.env` (gitignored) + shipped to host |
| ACME email | `BATTLEFUEL_ACME_EMAIL` | root `.env` |
**Never commit real values — names only here.**

## MCP Servers
(none)

## Prerequisites (one-time)
- OpenTofu CLI installed; Hetzner project + API token.
- `infra/secrets.auto.tfvars` created from `terraform.tfvars.example` (token + SSH key; lock
  `ssh_admin_cidr`).
- Root `.env` created from `.env.example` with real domain, strong DB password, ACME email,
  and `VITE_API_BASE`/`VITE_WS_BASE` pointing at the domain.
- `data/hohenfels.osm` and `data/hohenfels-roads.osm` present locally (the deploy ships `data/`;
  regenerate with `backend/scripts/build_basemap.sh` / `build_routing_graph.sh` if missing).

## Deployment Procedure

Step 1 (Provision host):
  Action:  `make provision`   # cd infra && tofu init && tofu apply
  Verify:  `cd infra && tofu output -raw floating_ipv4`   # prints the stable IP

Step 2 (Point DNS):
  Action:  Create an A record for `$BATTLEFUEL_DOMAIN` -> the floating IP from Step 1.
  Verify:  `dig +short $BATTLEFUEL_DOMAIN` returns the floating IP.

Step 3 (Deploy stack):
  Action:  `make deploy`   # rsync project+data+.env, build on host, compose up, bootstrap
  Verify:  deploy script's smoke check prints `https://$DOMAIN/api/v1/health -> 200`.

Step 4 (Post-deploy checks):
  Action:  `curl -s https://$BATTLEFUEL_DOMAIN/ -o /dev/null -w '%{http_code}\n'`
  Verify:  `200` for `/`, `/api/v1/health`; the SPA loads and the live sim WebSocket connects.

Step 5 (Enable nightly backups):
  Action:  on host, `crontab /opt/battlefuel/deploy/crontab.example`
  Verify:  `crontab -l | grep backup.sh` present; run `make backup` once -> a dump appears in
           `$BATTLEFUEL_BACKUP_DIR`.

## Redeploy (code/config change)
  Action:  `make deploy`   # rebuilds images on host and recreates changed services; bootstrap
           is skipped because the DB is already seeded.
  Verify:  smoke check -> `200`; `make prod-logs` shows no crash loops.

## Rollback Plan
1. **App regression:** `git checkout <last-good-sha>` locally, then `make deploy` (rebuilds the
   previous version on the host). The DB volume is untouched.
2. **Bad migration / data corruption:** restore the most recent good dump —
   `make restore FILE=/mnt/battlefuel-data/backups/battlefuel-<ts>.sql.gz` (run on host, or
   `ssh` in first). Then `make deploy` of the matching code version.
3. **Host-level failure:** `cd infra && tofu apply` recreates the server; the block volume
   (DB data + backups) is preserved and re-attached, then `make deploy` + bootstrap-skip.
4. **Full teardown (DESTRUCTIVE):** `cd infra && tofu destroy` removes the host (and volume
   unless detached) — only after confirming backups are safe offsite.
