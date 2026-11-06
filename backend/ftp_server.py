"""Secure FTP access for teachers and managers.

The LMS ``ftp_accounts`` table is the single source of truth. Students never
get a row there, so they can never log in. Each authenticated teacher is
confined to their own folder under ``/srv/files/teachers``.

Run inside the API image (it already has Django + psycopg + passlib):

    python ftp_server.py

Environment:
    FTP_PORT=21
    FTP_TLS_CERT=/ftp-tls/fullchain.pem
    FTP_TLS_KEY=/ftp-tls/privkey.pem
    FTP_REQUIRE_TLS=1
    FTP_PASV_ADDRESS=203.0.113.10
    FTP_UID=1500 / FTP_GID=1500
"""

import logging
import os
import sys
from pathlib import Path

import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
django.setup()

from passlib.hash import sha512_crypt  # noqa: E402
from pyftpdlib.authorizers import AuthenticationFailed, DummyAuthorizer  # noqa: E402
from pyftpdlib.handlers import FTPHandler, TLS_FTPHandler  # noqa: E402
from pyftpdlib.servers import FTPServer  # noqa: E402

from apps.accounts.models import FTPAccount  # noqa: E402

logger = logging.getLogger("darsjo.ftp")


def _env_bool(name, default=False):
    return str(os.environ.get(name, "1" if default else "0")).strip().lower() in {"1", "true", "yes", "on"}


class SchoolAuthorizer(DummyAuthorizer):
    """Authenticate against the LMS database instead of a static file."""

    def validate_authentication(self, username, password, handler):
        username = (username or "").strip().lower()
        if self.has_user(username):
            # refresh the row on every login so a password change is immediate
            self.user_table.pop(username, None)

        account = (
            FTPAccount.objects.select_related("user")
            .filter(ftp_username__iexact=username, enabled=True, user__is_active=True)
            .first()
        )
        if account is None or account.user.role not in {"admin", "teacher"}:
            raise AuthenticationFailed("Authentication failed.")
        try:
            valid = sha512_crypt.verify(password, account.password_hash)
        except (ValueError, TypeError):
            valid = False
        if not valid:
            raise AuthenticationFailed("Authentication failed.")

        home = Path(account.homedir)
        home.mkdir(parents=True, exist_ok=True, mode=0o750)
        self.add_user(
            username,
            password,
            str(home),
            perm="elradfmw",
            msg_login="ورود موفق. فقط پوشهٔ خودتان در دسترس است.",
        )


def _make_handler(base):
    class SchoolFTPHandler(base):
        def on_login(self, username):
            logger.info("login user=%s ip=%s", username, self.remote_ip)
            try:
                logfile = Path(os.environ.get("FTP_AUDIT_LOG", "/srv/lms/ftp/audit.log"))
                logfile.parent.mkdir(parents=True, exist_ok=True)
                with logfile.open("a", encoding="utf-8") as handle:
                    handle.write(f"login\t{username}\t{self.remote_ip}\t{self.started:.0f}\n")
            except OSError:
                pass

        def on_logout(self, username):
            logger.info("logout user=%s ip=%s", username, self.remote_ip)

    return SchoolFTPHandler


def main():
    logging.basicConfig(
        level=os.environ.get("FTP_LOG_LEVEL", "INFO"),
        format="[%(asctime)s] %(levelname)s %(name)s: %(message)s",
    )

    port = int(os.environ.get("FTP_PORT", "21"))
    cert = os.environ.get("FTP_TLS_CERT", "/ftp-tls/fullchain.pem")
    key = os.environ.get("FTP_TLS_KEY", "/ftp-tls/privkey.pem")
    require_tls = _env_bool("FTP_REQUIRE_TLS", True)
    have_cert = os.path.exists(cert) and os.path.exists(key)

    if require_tls and not have_cert:
        logger.error("TLS certificate not found (%s / %s); refusing to start", cert, key)
        sys.exit(1)

    base = TLS_FTPHandler if have_cert else FTPHandler
    handler = _make_handler(base)
    handler.authorizer = SchoolAuthorizer()
    handler.banner = "Imam School secure file service"
    handler.encoding = "utf8"
    handler.timeout = 300
    handler.max_login_attempts = 5
    handler.permit_foreign_addresses = False
    handler.passive_ports = range(30000, 30101)
    handler.masquerade_address = os.environ.get("FTP_PASV_ADDRESS") or None
    if have_cert:
        handler.certfile = cert
        handler.keyfile = key
        handler.tls_control_required = require_tls
        handler.tls_data_required = require_tls
    else:
        logger.warning("TLS certificate not found; running plain FTP (not recommended)")

    server = FTPServer(("0.0.0.0", port), handler)

    # Bind the privileged port as root, then drop to the same uid/gid as the
    # file panel so uploaded files stay editable there.
    if hasattr(os, "geteuid") and os.geteuid() == 0:
        uid = int(os.environ.get("FTP_UID", "1500"))
        gid = int(os.environ.get("FTP_GID", "1500"))
        try:
            os.setgroups([])
            os.setgid(gid)
            os.setuid(uid)
            logger.info("dropped privileges to %s:%s", uid, gid)
        except OSError as exc:
            logger.error("could not drop privileges: %s", exc)
            sys.exit(1)

    logger.info(
        "FTP ready on :%s tls=%s passive=30000-30100 user=%s",
        port,
        "required" if require_tls else "optional",
        handler.authorizer.__class__.__name__,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
