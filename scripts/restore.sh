#!/usr/bin/env bash
# Restore the production database from a gzipped pg_dump produced by scripts/backup.sh.
# Usage: scripts/restore.sh /mnt/battlefuel-data/backups/battlefuel-<ts>.sql.gz
#
# The dump was taken with --clean --if-exists, so it drops and recreates objects in place.
# DESTRUCTIVE: overwrites current data. Requires confirmation unless FORCE=1.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FILE="${1:?usage: restore.sh <backup.sql.gz>}"
[ -f "$FILE" ] || { echo "✖ no such backup: $FILE" >&2; exit 1; }

ENV_FILE="${BATTLEFUEL_ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

export COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"
COMPOSE=(docker compose)
DB_NAME="${BATTLEFUEL_DB_NAME:-battlefuel}"
DB_USER="${BATTLEFUEL_DB_USER:-battlefuel}"

if [ "${FORCE:-0}" != "1" ]; then
  printf '⚠ This will OVERWRITE database "%s" from %s\n  Type yes to continue: ' "$DB_NAME" "$FILE"
  read -r ans
  [ "$ans" = "yes" ] || { echo "aborted."; exit 1; }
fi

echo "▶ restoring $DB_NAME from $FILE …"
gunzip -c "$FILE" | "${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=0 -U "$DB_USER" -d "$DB_NAME" >/dev/null
echo "✓ restore complete."
