#!/usr/bin/env bash
# Reseed a DEPLOYED BattleFuel stack's database to the canonical scenario (unit placements, supply
# depots, the East/West frontline threat pattern) and re-cost the routing graph.
#
# WHY THIS EXISTS: the host auto-deploy (deploy/auto-deploy.sh) only pulls new images and restarts
# containers — it NEVER touches the database. So a wave that changes SEED DATA (unit/depot
# positions, initial tile threat, newly seeded units) is live in the code but invisible until the
# DB is reseeded. Symptom: /api/v1/enemy-units shows the new (code-provided) positions, but
# /api/v1/unit-instances and the tile threat still show the OLD arrangement.
#
# Usage — run ON THE HOST, from the repo dir (e.g. /opt/battlefuel):
#   bash deploy/reseed-stack.sh deploy/.env.dev      # reseed dev  (:3001)
#   bash deploy/reseed-stack.sh deploy/.env.prod     # reseed prod (:3000) — asks to confirm
#
# Then verify:  curl -s https://<host>/api/v1/unit-instances | grep -c inst-armor-2   # expect 1
set -euo pipefail

ENV_FILE="${1:?usage: reseed-stack.sh <env-file>  (e.g. deploy/.env.dev)}"
[ -f "$ENV_FILE" ] || { echo "✖ no such env-file: $ENV_FILE" >&2; exit 1; }

COMPOSE=(docker compose --env-file "$ENV_FILE" -f deploy/compose.app.yml)
project="$(grep -E '^COMPOSE_PROJECT_NAME=' "$ENV_FILE" | cut -d= -f2- || true)"
echo "▶ reseeding stack project='${project:-<compose default>}' (env: $ENV_FILE)"

# Fail fast if we can't see a running backend for THIS project (the usual cause of a "reseed that
# did nothing": COMPOSE_PROJECT_NAME missing/wrong, or run from the wrong directory).
if ! "${COMPOSE[@]}" ps --status running backend | grep -q backend; then
  echo "✖ no running 'backend' container for this project." >&2
  echo "  Check COMPOSE_PROJECT_NAME in $ENV_FILE (dev=battlefuel-dev / prod=battlefuel-prod)" >&2
  echo "  and that you're in the repo dir. 'docker compose --env-file $ENV_FILE -f deploy/compose.app.yml ps'" >&2
  exit 1
fi

# Prod safety: reseeding resets unit positions + threat, so confirm before touching prod.
case "$ENV_FILE" in
  *prod*)
    read -r -p "⚠ This RESETS unit positions + threat on PROD (:3000). Type 'yes' to proceed: " ans
    [ "$ans" = "yes" ] || { echo "aborted."; exit 1; }
    ;;
esac

run() { echo "  → scripts/$1"; "${COMPOSE[@]}" exec -T backend python "scripts/$1"; }
run seed_unit_instances.py   # unit placements (forward combat west, HQ/trucks rear)
run seed_supply.py           # fuel depots
run seed_threats.py          # initial East/West frontline threat pattern
run annotate_routing.py      # re-cost the routing graph from the new tile threat

echo "✓ reseed complete for ${project:-<compose default>}."
