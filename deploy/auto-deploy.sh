#!/usr/bin/env bash
# Poll GHCR and roll out new backend/frontend images for one environment.
# Replaces Watchtower (containrrr/watchtower is unmaintained and bundles a Docker client too
# old for modern Docker Engine — "client version 1.25 is too old. Minimum supported 1.40").
# This uses the HOST Docker, so there is never a client-version mismatch.
#
# Run from cron (see deploy/crontab.example):
#   deploy/auto-deploy.sh deploy/.env.prod   # prod (:3000)
#   deploy/auto-deploy.sh deploy/.env.dev    # dev  (:3001)
#
# The host must be logged in to GHCR once (docker login ghcr.io) so private pulls work.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:?usage: auto-deploy.sh <env-file> (e.g. deploy/.env.prod)}"
[ -f "$ENV_FILE" ] || { echo "✖ no such env-file: $ENV_FILE" >&2; exit 1; }

COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/compose.app.yml)

# Pull only the app images. db is stateful and rarely changes — update it deliberately, not
# on every push (avoids needless DB restarts).
"${COMPOSE[@]}" pull --quiet backend frontend

# `up -d` recreates a service only if its image digest actually changed; otherwise it's a
# no-op. So this is cheap to run every minute.
"${COMPOSE[@]}" up -d backend frontend

# Reclaim space from superseded image layers.
docker image prune -f >/dev/null 2>&1 || true
