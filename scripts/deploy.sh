#!/usr/bin/env bash
# Explicit, scripted deploy of BattleFuel to the provisioned Hetzner host.
# NEVER runs automatically — a human invokes `make deploy` (or this script) deliberately.
#
# Steps: preflight -> rsync project (incl. data/ + .env) to the host -> build images on the
# host -> compose up -> one-time bootstrap (if DB empty) -> smoke check.
#
# Host is taken from $DEPLOY_HOST, else the OpenTofu `floating_ipv4` output. SSH user is
# $DEPLOY_USER (default root). Provision the host first with: make provision  (tofu apply).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/battlefuel}"
SSH_USER="${DEPLOY_USER:-root}"

info() { printf '\033[36m▶ %s\033[0m\n' "$1"; }
die()  { printf '\033[31m✖ %s\033[0m\n' "$1" >&2; exit 1; }

# --- Resolve target host ------------------------------------------------------------------
HOST="${DEPLOY_HOST:-}"
if [ -z "$HOST" ]; then
  info "DEPLOY_HOST unset — reading floating_ipv4 from OpenTofu…"
  HOST="$(cd infra && tofu output -raw floating_ipv4 2>/dev/null || true)"
fi
[ -n "$HOST" ] || die "No deploy host. Set DEPLOY_HOST or run 'make provision' first."
SSH_TARGET="$SSH_USER@$HOST"

# --- Preflight ----------------------------------------------------------------------------
[ -f .env ] || die "Missing .env (copy .env.example and fill it in)."
info "Deploy target: $SSH_TARGET:$REMOTE_DIR"
ssh -o StrictHostKeyChecking=accept-new "$SSH_TARGET" 'docker --version && docker compose version' \
  >/dev/null 2>&1 || die "Cannot reach Docker on $SSH_TARGET (is the host provisioned/up?)."

# --- Ship the project (source build context + data + secrets) -----------------------------
# data/ is required for the DB bootstrap (osm extracts are gitignored, so they ship here).
info "Syncing project to host…"
rsync -az --delete \
  --exclude '.git/' --exclude 'node_modules/' --exclude '**/.venv/' \
  --exclude '**/__pycache__/' --exclude '**/dist/' --exclude 'infra/.terraform/' \
  --exclude '.mdd/' --exclude '*.tfstate*' \
  ./ "$SSH_TARGET:$REMOTE_DIR/"

# --- Build + bring up + bootstrap, on the host --------------------------------------------
info "Building images + starting stack on host…"
ssh "$SSH_TARGET" bash -se <<REMOTE
  set -euo pipefail
  cd "$REMOTE_DIR"
  docker compose -f compose.prod.yml --env-file .env build
  docker compose -f compose.prod.yml --env-file .env up -d

  # First-time data bootstrap only when the DB has no tiles yet (idempotent + cheap check).
  tiles=\$(docker compose -f compose.prod.yml --env-file .env exec -T db \
    psql -U "\${BATTLEFUEL_DB_USER:-battlefuel}" -d "\${BATTLEFUEL_DB_NAME:-battlefuel}" \
    -tAc "SELECT count(*) FROM tiles" 2>/dev/null | tr -d '[:space:]' || echo 0)
  if [ "\${tiles:-0}" -gt 0 ] 2>/dev/null; then
    echo "DB already seeded (\$tiles tiles) — skipping bootstrap."
  else
    echo "Empty DB — running first-time bootstrap…"
    bash scripts/prod-bootstrap.sh
  fi
REMOTE

# --- Smoke check (public edge) ------------------------------------------------------------
DOMAIN="$(grep -E '^BATTLEFUEL_DOMAIN=' .env | tail -1 | cut -d= -f2-)"
DOMAIN="${DOMAIN%\"}"; DOMAIN="${DOMAIN#\"}"   # strip optional surrounding quotes
if [ -n "${DOMAIN:-}" ]; then
  info "Smoke check against https://$DOMAIN …"
  code="$(curl -s -o /dev/null -w '%{http_code}' "https://$DOMAIN/api/v1/health" || echo 000)"
  if [ "$code" = "200" ]; then
    printf '\033[32m✓ deploy OK — https://%s/api/v1/health -> 200\033[0m\n' "$DOMAIN"
  else
    printf '\033[33m⚠ deployed, but https://%s/api/v1/health -> %s (DNS/TLS may still be settling)\033[0m\n' "$DOMAIN" "$code"
  fi
fi
info "Done."
