#!/usr/bin/env bash
# Install the background timers for the school LMS.
set -euo pipefail

APP_DIR=/opt/darsjo

write_unit() {
  local name="$1" desc="$2" cmd="$3" schedule="$4"
  cat > "/etc/systemd/system/darsjo-$name.service" <<EOF
[Unit]
Description=$desc
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
WorkingDirectory=$APP_DIR
ExecStart=$cmd
EOF
  cat > "/etc/systemd/system/darsjo-$name.timer" <<EOF
[Unit]
Description=$desc (timer)

[Timer]
OnCalendar=$schedule
Persistent=true
RandomizedDelaySec=90

[Install]
WantedBy=timers.target
EOF
}

write_unit "reconcile" "School LMS — close finished BBB sessions" \
  "/usr/bin/docker compose exec -T api python manage.py reconcile_meetings" "*:0/2"

write_unit "recordings" "School LMS — pull new BBB recordings" \
  "/usr/bin/docker compose exec -T api python manage.py sync_recordings" "*:1/5"

write_unit "prune" "School LMS — delete expired recordings" \
  "/usr/bin/docker compose exec -T api python manage.py prune_recordings" "*-*-* 04:30:00"

write_unit "prune-audit" "School LMS — delete audit logs older than a week" \
  "/usr/bin/docker compose exec -T api python manage.py prune_audit" "*-*-* 04:45:00"

write_unit "backup" "School LMS — database + media backup" \
  "/bin/bash $APP_DIR/deploy/backup-lms.sh" "*-*-* 03:15:00"

write_unit "portal" "School LMS — sync teacher accounts with the file panel" \
  "/usr/bin/docker compose exec -T api python manage.py sync_portal_users" "*:2/5"

systemctl daemon-reload
# Backups are manual for now (the school asked for that explicitly). The unit
# file stays here so it can be switched on later without a redeploy.
systemctl disable --now darsjo-backup.timer >/dev/null 2>&1 || true
for unit in reconcile recordings prune prune-audit portal; do
  systemctl enable --now "darsjo-$unit.timer" >/dev/null
done
systemctl list-timers 'darsjo-*' --no-pager
