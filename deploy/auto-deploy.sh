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

# Serialize across ALL invocations (the cron fires this every minute for both prod AND dev). Two
# overlapping runs corrupt the containerd content store — one run's `docker image prune` (or a
# second concurrent pull) deletes layers another run is still pulling, giving
# "failed commit … rename … no such file or directory" / "lease does not exist". A single global
# lock makes a slow pull simply skip the next tick instead of racing it.
exec 9>/tmp/battlefuel-auto-deploy.lock
if ! flock -n 9; then
  echo "auto-deploy: another run holds the lock — skipping this tick"
  exit 0
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/compose.app.yml)

# Pull only the app images. db is stateful and rarely changes — update it deliberately, not
# on every push (avoids needless DB restarts).
"${COMPOSE[@]}" pull --quiet backend frontend

# `up -d` recreates a service only if its image digest actually changed; otherwise it's a
# no-op. So this is cheap to run every minute.
"${COMPOSE[@]}" up -d backend frontend

# Reclaim space from superseded image layers.
docker image prune -f >/dev/null 2>&1 || true
