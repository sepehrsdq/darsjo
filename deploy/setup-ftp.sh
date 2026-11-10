#!/usr/bin/env bash
# Prepare and start the secure FTP service (teachers/managers only).
# No apt-get: the API/Python image already contains pyftpdlib and pyOpenSSL.
set -euo pipefail

APP_DIR=/opt/darsjo
FILES_ROOT=/srv/files/teachers
DATA_DIR=/srv/lms/ftp
TLS_DIR=/srv/lms/ftp-tls
CERT_DIR=/etc/letsencrypt/live/files.example.ir

log() { echo; echo "=== $* ==="; }
fail() { echo "FAILED: $*" >&2; exit 1; }

log "0) system user and folders"
if ! id darsjo >/dev/null 2>&1; then
  useradd --system --uid 1500 --home /srv/files --shell /usr/sbin/nologin darsjo 2>/dev/null || true
fi
FTP_UID=$(id -u darsjo)
FTP_GID=$(id -g darsjo)
mkdir -p "$FILES_ROOT" "$DATA_DIR" "$TLS_DIR"
chown -R darsjo:darsjo "$FILES_ROOT" "$DATA_DIR" || true
chmod 750 "$FILES_ROOT" "$DATA_DIR"

log "1) TLS material for explicit FTP over TLS"
[ -f "$CERT_DIR/fullchain.pem" ] || fail "certificate for files.example.ir not found; run certbot first"
[ -f "$CERT_DIR/privkey.pem" ] || fail "private key for files.example.ir not found"
install -o root -g darsjo -m 640 "$CERT_DIR/fullchain.pem" "$TLS_DIR/fullchain.pem"
install -o root -g darsjo -m 640 "$CERT_DIR/privkey.pem" "$TLS_DIR/privkey.pem"
chmod 750 "$TLS_DIR"

log "2) per-teacher home folders"
runuser -u postgres -- psql -tA -d "darsjo" \
  -c "select homedir from accounts_ftpaccount where enabled order by ftp_username" 2>/dev/null |
while read -r homedir; do
  [ -z "$homedir" ] && continue
  mkdir -p "$homedir"
  chown -R "$FTP_UID:$FTP_GID" "$homedir"
  chmod 750 "$homedir"
done

log "3) build and start the FTP container"
cd "$APP_DIR"
# The container must run as the same uid/gid as the file panel. Compose reads
# these two values from .env for interpolation, so keep that file in sync.
if [ -f "$APP_DIR/.env" ]; then
  if grep -q '^FTP_UID=' "$APP_DIR/.env"; then
    sed -i "s|^FTP_UID=.*|FTP_UID=$FTP_UID|" "$APP_DIR/.env"
  else
    echo "FTP_UID=$FTP_UID" >> "$APP_DIR/.env"
  fi
  if grep -q '^FTP_GID=' "$APP_DIR/.env"; then
    sed -i "s|^FTP_GID=.*|FTP_GID=$FTP_GID|" "$APP_DIR/.env"
  else
    echo "FTP_GID=$FTP_GID" >> "$APP_DIR/.env"
  fi
fi
docker compose build ftp
docker compose up -d --force-recreate --no-deps ftp
sleep 3
docker compose ps ftp
docker compose logs --tail=30 ftp || true

log "4) firewall (also open 21/tcp and 30000:30100/tcp in the provider panel)"
ufw allow 21/tcp >/dev/null 2>&1 || true
ufw allow 30000:30100/tcp >/dev/null 2>&1 || true
ufw status | sed -n '1,20p' || true

echo
echo "FTP ready: host files.example.ir, port 21, explicit FTP over TLS, passive 30000-30100."
echo "Only rows in accounts_ftpaccount (teachers/managers) can log in; students can never log in."
