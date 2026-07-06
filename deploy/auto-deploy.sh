#!/usr/bin/env bash
# Poll GHCR and roll out new backend/frontend images for one environment.
# Replaces Watchtower (containrrr/watchtower is unmaintained and bundles a Docker client too
# old for modern Docker Engine). This uses the HOST Docker, so there is never a client mismatch.
#
# Run from cron (see deploy/crontab.example):
#   deploy/auto-deploy.sh deploy/.env.prod   # prod (:3000)
#   deploy/auto-deploy.sh deploy/.env.dev    # dev  (:3001)
#
# The host must be logged in to GHCR once (docker login ghcr.io) so private pulls work.
#
# Robustness (2026-07): every step now logs with a timestamp and the env name, the lock file is
# per-UID (a root-owned lock from a manual `sudo` run no longer blocks a cron run under another
# user — that used to kill the script at `exec 9>` before it ever pulled), and a failed pull logs
# a clear reason + hint instead of dying silently under `set -e`.

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:?usage: auto-deploy.sh <env-file> (e.g. deploy/.env.prod)}"
[ -f "$ENV_FILE" ] || { echo "✖ no such env-file: $ENV_FILE" >&2; exit 1; }

TAG="$(basename "$ENV_FILE" | sed 's/^\.env\.//')"   # .env.prod -> prod (for log lines only)
log() { printf '%s [auto-deploy:%s] %s\n' "$(date -u +%FT%TZ)" "$TAG" "$*"; }

# Host-wide lock. The cron fires this every minute for BOTH prod AND dev (and sibling projects
# share this same path), so concurrent pulls + `docker image prune` never race the shared
# containerd store. Crucially we WAIT for the lock (up to LOCK_WAIT_S) rather than skip on
# contention — the old `flock -n` skip meant a busy host could starve an env for many ticks, so a
# stale image never rolled. Waiting lets every tick eventually roll.
LOCK="/tmp/battlefuel-auto-deploy.lock"
LOCK_WAIT_S=50
if ! exec 9>>"$LOCK" 2>/dev/null; then
  log "✖ cannot open lock file $LOCK — check permissions"; exit 1
fi
if ! flock -w "$LOCK_WAIT_S" 9; then
  log "lock busy for ${LOCK_WAIT_S}s — skipping this tick"; exit 0
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/compose.app.yml)

# Docker must be reachable (socket perms / daemon up) before we try anything.
if ! docker info >/dev/null 2>&1; then
  log "✖ cannot talk to the Docker daemon — is this user in the 'docker' group / is dockerd up?"
  exit 1
fi

# Record the image IDs we are running now, so we can report whether the roll actually changed them.
before="$("${COMPOSE[@]}" images -q backend frontend 2>/dev/null | sort || true)"

# Pull only the app images. db is stateful and rarely changes — update it deliberately, not on
# every push. A pull failure is almost always an expired GHCR login; log it and bail (cron retries).
log "pulling backend + frontend ($TAG tag)…"
if ! pull_out="$("${COMPOSE[@]}" pull backend frontend 2>&1)"; then
  log "✖ pull failed:"; printf '%s\n' "$pull_out" | sed 's/^/    /'
  log "  hint: the host may need 'docker login ghcr.io' (token expired) — private pulls need auth."
  exit 1
fi

# `up -d` recreates a service only if its image digest actually changed; otherwise it's a no-op.
if ! up_out="$("${COMPOSE[@]}" up -d backend frontend 2>&1)"; then
  log "✖ up -d failed:"; printf '%s\n' "$up_out" | sed 's/^/    /'
  exit 1
fi

after="$("${COMPOSE[@]}" images -q backend frontend 2>/dev/null | sort || true)"
if [ "$before" = "$after" ]; then
  log "no image change — already current."
else
  log "rolled new image(s):"; printf '%s\n' "$up_out" | grep -Ei 'recreat|start' | sed 's/^/    /' || true
fi

# Reclaim space from superseded image layers.
docker image prune -f >/dev/null 2>&1 || true
log "done."
