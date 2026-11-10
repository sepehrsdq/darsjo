#!/usr/bin/env bash
# Daily backup: PostgreSQL dump + uploaded media. Run from cron/systemd on the host.
set -euo pipefail

APP_DIR=/opt/darsjo
BACKUP_DIR=/srv/lms/backup
RETENTION_DAYS=14
STAMP=$(date +%Y-%m-%d_%H-%M)

mkdir -p "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

cd "$APP_DIR"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h 127.0.0.1 -p 5432 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --format=custom --no-owner \
  -f "$BACKUP_DIR/db-$STAMP.dump"

tar -czf "$BACKUP_DIR/media-$STAMP.tar.gz" -C /srv/lms media

# integrity checks
pg_restore -l "$BACKUP_DIR/db-$STAMP.dump" >/dev/null
tar -tzf "$BACKUP_DIR/media-$STAMP.tar.gz" >/dev/null

find "$BACKUP_DIR" -type f \( -name 'db-*.dump' -o -name 'media-*.tar.gz' \) \
  -mtime +"$RETENTION_DAYS" -delete

echo "backup ok: $STAMP"
