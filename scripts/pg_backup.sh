#!/bin/sh
# pg_backup.sh — daily pg_dump compressed backup with 7-day retention.
# Runs inside the postgres container (or any host with pg_dump + access).
#
# Environment variables (set via docker-compose):
#   PGHOST, PGUSER, PGDATABASE, PGPASSWORD — standard libpq vars
#   BACKUP_DIR    — where to write dumps (default: /backups)
#   RETENTION_DAYS — how many days to keep (default: 7)

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
FILENAME="${BACKUP_DIR}/${PGDATABASE:-math_defense}_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "[pg_backup] Starting backup: $FILENAME"
pg_dump -h "${PGHOST:-postgres}" -U "${PGUSER:-mathdefense}" "${PGDATABASE:-math_defense}" \
  | gzip > "$FILENAME"

echo "[pg_backup] Backup complete: $(du -h "$FILENAME" | cut -f1)"

# Prune old backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"$RETENTION_DAYS" -delete
echo "[pg_backup] Pruned backups older than ${RETENTION_DAYS} days"
