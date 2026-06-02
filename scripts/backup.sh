#!/usr/bin/env bash
# Timestamped, compressed pg_dump of the production database, with retention pruning.
# Run on the host (manually or from cron — see deploy/crontab.example). Writes to
# BATTLEFUEL_BACKUP_DIR (on the block volume, so backups survive host loss).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${BATTLEFUEL_ENV_FILE:-.env}"
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

export COMPOSE_FILE="${COMPOSE_FILE:-compose.prod.yml}"
COMPOSE=(docker compose)
DB_NAME="${BATTLEFUEL_DB_NAME:-battlefuel}"
DB_USER="${BATTLEFUEL_DB_USER:-battlefuel}"
BACKUP_DIR="${BATTLEFUEL_BACKUP_DIR:-/var/lib/battlefuel/backups}"
RETENTION_DAYS="${BATTLEFUEL_BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/battlefuel-$ts.sql.gz"

# --clean --if-exists so the dump is restorable into an existing database.
"${COMPOSE[@]}" exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$out"

# Fail loudly if the dump is suspiciously small (empty/failed).
size_bytes="$(wc -c < "$out" | tr -d '[:space:]')"
if [ "${size_bytes:-0}" -lt 100 ]; then
  echo "✖ backup looks empty ($size_bytes bytes): $out" >&2
  exit 1
fi

echo "✓ wrote $out ($(du -h "$out" | cut -f1))"

# Retention: drop dumps older than the window.
pruned="$(find "$BACKUP_DIR" -name 'battlefuel-*.sql.gz' -type f -mtime +"$RETENTION_DAYS" -print -delete | wc -l | tr -d '[:space:]')"
echo "✓ retention: kept <= ${RETENTION_DAYS}d, pruned ${pruned:-0} old backup(s)"
