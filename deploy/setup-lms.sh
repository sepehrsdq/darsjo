#!/usr/bin/env bash
# Deploy the school LMS to kelaas.example.ir (run as root on 203.0.113.10).
# Expects /root/lms-src.tar.gz to contain the lms/ tree.
set -euo pipefail

APP_DIR=/opt/darsjo
DATA_DIR=/srv/lms
DOMAIN=kelaas.example.ir
PORTAL_ENV=/etc/darsjo-portal.env

log() { echo; echo "=== $* ==="; }
fail() { echo "FAILED: $*" >&2; exit 1; }

log "0) preflight"
docker --version
docker compose version
mkdir -p "$APP_DIR" "$DATA_DIR/media" "$DATA_DIR/backup"
chmod 755 "$DATA_DIR" "$DATA_DIR/media"
chmod 750 "$DATA_DIR/backup"

log "1) unpack sources"
rm -rf "$APP_DIR"/backend "$APP_DIR"/frontend "$APP_DIR"/deploy "$APP_DIR"/docker-compose.yml "$APP_DIR"/.env.example
tar -xzf /root/lms-src.tar.gz -C "$APP_DIR" --strip-components=1
chmod +x "$APP_DIR"/deploy/*.sh 2>/dev/null || true

log "2) secrets / env file"
PGPASS=""; DJANGO_KEY=""
if [ -f "$APP_DIR/.env" ]; then
  PGPASS=$(grep -E '^POSTGRES_PASSWORD=' "$APP_DIR/.env" | cut -d= -f2- || true)
  DJANGO_KEY=$(grep -E '^DJANGO_SECRET_KEY=' "$APP_DIR/.env" | cut -d= -f2- || true)
fi
[ -n "$PGPASS" ] || PGPASS=$(openssl rand -hex 24)
[ -n "$DJANGO_KEY" ] || DJANGO_KEY=$(openssl rand -hex 48)
# The school asked for one shared admin password across both systems.
ADMIN_PASS="ChangeMe#Admin"
BBB_SECRET=$(grep -E '^securitySalt=' /etc/bigbluebutton/bbb-web.properties | cut -d= -f2)

# File panel database (same PostgreSQL server, separate database).
PORTAL_DB_HOST=$(grep -E '^PGHOST=' "$PORTAL_ENV" 2>/dev/null | cut -d= -f2- || true)
PORTAL_DB_PORT=$(grep -E '^PGPORT=' "$PORTAL_ENV" 2>/dev/null | cut -d= -f2- || true)
PORTAL_DB_NAME=$(grep -E '^PGDATABASE=' "$PORTAL_ENV" 2>/dev/null | cut -d= -f2- || true)
PORTAL_DB_USER=$(grep -E '^PGUSER=' "$PORTAL_ENV" 2>/dev/null | cut -d= -f2- || true)
PORTAL_DB_PASSWORD=$(grep -E '^PGPASSWORD=' "$PORTAL_ENV" 2>/dev/null | cut -d= -f2- || true)
PORTAL_DB_HOST=${PORTAL_DB_HOST:-127.0.0.1}
PORTAL_DB_PORT=${PORTAL_DB_PORT:-5432}
PORTAL_DB_NAME=${PORTAL_DB_NAME:-darsjo_portal}
PORTAL_DB_USER=${PORTAL_DB_USER:-darsjo_app}

umask 077
cat > "$APP_DIR/.env" <<EOF
DJANGO_SECRET_KEY=$DJANGO_KEY
DJANGO_DEBUG=0
DJANGO_ALLOWED_HOSTS=$DOMAIN,127.0.0.1,localhost
DJANGO_CSRF_TRUSTED_ORIGINS=https://$DOMAIN
SESSION_COOKIE_SECURE=1
CSRF_COOKIE_SECURE=1
SECURE_SSL_REDIRECT=0

POSTGRES_DB=darsjo
POSTGRES_USER=darsjo
POSTGRES_PASSWORD=$PGPASS
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432

PORTAL_DB_HOST=$PORTAL_DB_HOST
PORTAL_DB_PORT=$PORTAL_DB_PORT
PORTAL_DB_NAME=$PORTAL_DB_NAME
PORTAL_DB_USER=$PORTAL_DB_USER
PORTAL_DB_PASSWORD=$PORTAL_DB_PASSWORD

BBB_URL=https://bbb.example.ir/bigbluebutton/api
BBB_SECRET=$BBB_SECRET
BBB_VERIFY_TLS=1

SCHOOL_NAME="دبستان مهر"
DEFAULT_ACADEMIC_YEAR=1405-1406
FILES_ROOT=/srv/files/teachers
MEDIA_ROOT=/srv/lms/media
RECORDING_RETENTION_DAYS=120

CAPTCHA_ENABLED=1
CACHE_DIR=/app/.cache
SESSION_START_GRACE_MINUTES=15

# The FTP service must run as the same uid/gid as the file panel, otherwise
# teachers cannot edit files they upload from either side.
FTP_UID=$(id -u darsjo 2>/dev/null || echo 1500)
FTP_GID=$(id -g darsjo 2>/dev/null || echo 1500)
FTP_REQUIRE_TLS=1
FTP_PASV_ADDRESS=203.0.113.10

LOGIN_MAX_FAILURES=5
LOGIN_LOCK_MINUTES=15
LOGIN_WINDOW_MINUTES=15

INTERNAL_API_URL=http://127.0.0.1:8000

ADMIN_USERNAME=admin
ADMIN_PASSWORD=$ADMIN_PASS
EOF
chmod 600 "$APP_DIR/.env"

log "3) PostgreSQL role/database"
runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='darsjo'" | grep -q 1 \
  || runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "CREATE ROLE darsjo LOGIN PASSWORD '$PGPASS'"
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -c "ALTER ROLE darsjo WITH LOGIN PASSWORD '$PGPASS'"
runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='darsjo'" | grep -q 1 \
  || runuser -u postgres -- createdb -O darsjo darsjo
runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d darsjo -c "GRANT ALL ON SCHEMA public TO darsjo;"

# The LMS role needs to write the shared account rows in the file-panel database.
if [ -n "$PORTAL_DB_PASSWORD" ]; then
  runuser -u postgres -- psql -v ON_ERROR_STOP=1 -d "$PORTAL_DB_NAME" \
    -c "GRANT CONNECT ON DATABASE $PORTAL_DB_NAME TO darsjo;" \
    -c "GRANT SELECT, INSERT, UPDATE ON users TO darsjo;" 2>/dev/null || true
fi

log "4) build & start containers"
cd "$APP_DIR"
docker compose down --remove-orphans 2>/dev/null || true
docker compose build
docker compose up -d
sleep 6
docker compose ps

log "5) wait for the API"
for i in $(seq 1 50); do
  if curl -fsS --max-time 3 http://127.0.0.1:8000/api/health/ >/dev/null 2>&1; then break; fi
  sleep 2
done
curl -fsS http://127.0.0.1:8000/api/health/ && echo

log "5b) migrate + accounts"
docker compose exec -T api python manage.py migrate --noinput
docker compose exec -T api python manage.py bootstrap_admin --force-password
# The pilot is over: the school starts with only the real manager account.
# Teachers and students are created through the UI or the Excel import.
docker compose exec -T api python manage.py sync_portal_users || true

log "5c) screenshot of the real accounts"
docker compose exec -T api python manage.py shell -c "
from apps.accounts.models import User
for u in User.objects.order_by('role','username'):
    print(f'{u.role:8s} {u.username:14s} active={u.is_active} change={u.must_change_password}')
" 2>&1 | tail -20

{
  echo "LMS — https://$DOMAIN"
  echo "admin / $ADMIN_PASS"
  echo "Teachers and students: create them from «کاربرها» or «افزودن گروهی»."
} > /root/lms-admin-credentials.txt
chmod 600 /root/lms-admin-credentials.txt

log "6) nginx vhost"
cp "$APP_DIR/deploy/nginx-meet.conf" /etc/nginx/sites-available/meet-ssl.conf
ln -sf /etc/nginx/sites-available/meet-ssl.conf /etc/nginx/sites-enabled/meet-ssl.conf
nginx -t
systemctl reload nginx

log "7) TLS certificate"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  cat > /etc/nginx/sites-available/meet-acme.conf <<EOF
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  location /.well-known/acme-challenge/ { root /var/www/bigbluebutton-default/assets; }
  location / { return 301 https://\$host\$request_uri; }
}
EOF
  ln -sf /etc/nginx/sites-available/meet-acme.conf /etc/nginx/sites-enabled/meet-acme.conf
  nginx -t && systemctl reload nginx
  certbot certonly --webroot -w /var/www/bigbluebutton-default/assets -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email || fail "certbot failed"
fi

log "8) haproxy certificate bundle"
cat "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "/etc/letsencrypt/live/$DOMAIN/privkey.pem" > /etc/haproxy/meet.pem
chmod 600 /etc/haproxy/meet.pem
if ! grep -q "meet.pem" /etc/haproxy/haproxy.cfg; then
  cp /etc/haproxy/haproxy.cfg "/etc/haproxy/haproxy.cfg.bak.$(date +%s)"
  sed -i 's|crt /etc/haproxy/files.pem|crt /etc/haproxy/files.pem crt /etc/haproxy/meet.pem|' /etc/haproxy/haproxy.cfg
fi
haproxy -c -f /etc/haproxy/haproxy.cfg
systemctl reload haproxy

log "8b) secure FTP (teachers/managers only)"
bash "$APP_DIR/deploy/setup-ftp.sh" || echo "FTP setup reported a problem; check docker compose logs ftp"

log "9) smoke tests"
curl -sk -o /dev/null -w 'meet login: %{http_code}\n' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/login"
curl -sk -o /dev/null -w 'meet api:   %{http_code}\n' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health/"
curl -sk -o /dev/null -w 'meet captcha: %{http_code}\n' --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/auth/captcha"
curl -sk -o /dev/null -w 'files:      %{http_code}\n' --resolve "files.example.ir:443:127.0.0.1" "https://files.example.ir/"
curl -sk -o /dev/null -w 'bbb:        %{http_code}\n' --resolve "bbb.example.ir:443:127.0.0.1" "https://bbb.example.ir/"

echo
echo "=== LMS DEPLOYED ==="
