"""Two-way mirror of teacher/admin accounts with the file panel database.

`users` in the LMS stays the source of truth for the school. Teachers and admins
are also written into the file panel's own PostgreSQL database (``darsjo_portal``)
with a compatible scrypt hash, so one username/password opens both systems.

Students are never mirrored: they do not exist in the file panel at all.
"""

import hashlib
import hmac
import logging

import requests
from django.conf import settings

from .models import PortalAccount, User

logger = logging.getLogger(__name__)

SHARED_ROLES = {"admin", "teacher"}
DEFAULT_QUOTA = 15 * 1024**3


def _enabled() -> bool:
    return bool(settings.PORTAL_DB_HOST and settings.PORTAL_DB_USER)


def _fingerprint(password_hash: str) -> str:
    return hashlib.sha256((password_hash or "").encode("utf-8")).hexdigest()


def _connect():
    if not _enabled():
        return None
    try:
        import psycopg

        return psycopg.connect(
            host=settings.PORTAL_DB_HOST,
            port=settings.PORTAL_DB_PORT,
            dbname=settings.PORTAL_DB_NAME,
            user=settings.PORTAL_DB_USER,
            password=settings.PORTAL_DB_PASSWORD,
            connect_timeout=5,
        )
    except Exception as exc:  # pragma: no cover - depends on the deployment
        logger.warning("portal db unavailable: %s", exc)
        return None


def connect():
    """Public version of the portal connection for the recordings mirror."""
    return _connect()


def _remember(user: User) -> None:
    PortalAccount.objects.update_or_create(
        username=user.username.lower(),
        defaults={"hash_fingerprint": _fingerprint(user.password)},
    )


def push_user(user: User) -> bool:
    """Write one teacher/admin into the file panel database. Never raises."""
    if user.role not in SHARED_ROLES:
        return False
    connection = _connect()
    if connection is None:
        return False

    name = (user.full_name or user.username).strip()
    active = bool(user.is_active)
    password_hash = user.password or ""

    try:
        with connection, connection.cursor() as cur:
            cur.execute(
                """
                UPDATE users
                   SET display_name = %s,
                       role = %s,
                       is_active = %s,
                       updated_at = now()
                 WHERE lower(username) = lower(%s)
                """,
                (name, user.role, active, user.username),
            )
            updated = cur.rowcount
            # Only a scrypt hash can be verified by the Node app.
            if password_hash.startswith("scrypt$"):
                if updated:
                    cur.execute(
                        "UPDATE users SET password_hash = %s WHERE lower(username) = lower(%s)",
                        (password_hash, user.username),
                    )
                elif active:
                    cur.execute(
                        """
                        INSERT INTO users
                            (username, display_name, role, password_hash, quota_bytes, is_active)
                        VALUES (%s, %s, %s, %s, %s, TRUE)
                        """,
                        (user.username, name, user.role, password_hash, DEFAULT_QUOTA),
                    )
        if password_hash.startswith("scrypt$"):
            _remember(user)
        return True
    except Exception as exc:  # pragma: no cover - depends on the deployment
        logger.warning("portal push failed for %s: %s", user.username, exc)
        return False
    finally:
        try:
            connection.close()
        except Exception:
            pass


def delete_user(username: str) -> bool:
    """Delete the mirrored account in the file panel (it archives the folder).

    Returns False only when the panel is configured but the request failed, so
    the caller can stop the local delete and keep both systems in sync.
    """
    if not _enabled():
        return True
    secret = settings.PORTAL_INTERNAL_SECRET
    if not secret:
        logger.warning("PORTAL_INTERNAL_SECRET is empty; cannot delete %s from the file panel", username)
        return False

    signature = hmac.new(secret.encode("utf-8"), username.encode("utf-8"), hashlib.sha256).hexdigest()
    try:
        response = requests.post(
            f"{settings.PORTAL_INTERNAL_URL}/api/internal/users/delete",
            json={"username": username},
            headers={"X-Darsjo-Signature": signature},
            timeout=8,
        )
    except Exception as exc:  # pragma: no cover - depends on the deployment
        logger.warning("portal delete failed for %s: %s", username, exc)
        return False

    if response.status_code >= 400:
        logger.warning(
            "portal delete rejected for %s: %s %s",
            username,
            response.status_code,
            response.text[:200],
        )
        return False
    return True


def pull_users() -> dict:
    """Import/refresh admins and teachers created in the file panel."""
    connection = _connect()
    if connection is None:
        return {"created": 0, "updated": 0, "skipped": 0}

    created = updated = skipped = 0
    try:
        with connection, connection.cursor() as cur:
            cur.execute(
                "SELECT username, display_name, role, password_hash, is_active, updated_at "
                "FROM users ORDER BY id"
            )
            rows = cur.fetchall()
    except Exception as exc:  # pragma: no cover
        logger.warning("portal pull failed: %s", exc)
        return {"created": 0, "updated": 0, "skipped": 0}
    finally:
        try:
            connection.close()
        except Exception:
            pass

    for username, display_name, role, password_hash, is_active, _updated_at in rows:
        username = (username or "").strip().lower()
        if not username or role not in SHARED_ROLES or not password_hash:
            skipped += 1
            continue

        user = User.objects.filter(username__iexact=username).first()
        portal_fp = _fingerprint(password_hash)

        if user is None:
            first, _, last = (display_name or username).strip().partition(" ")
            user = User(
                username=username,
                first_name=first or username,
                last_name=last.strip(),
                role=role,
                is_active=bool(is_active),
                must_change_password=False,
            )
            user.password = password_hash
            user.save()
            _remember(user)
            created += 1
            continue

        mirror = PortalAccount.objects.filter(username=username).first()
        changed_fields = []

        # Adopt the file panel's password when it changed there (or on first sync).
        lms_unchanged = mirror is not None and mirror.hash_fingerprint == _fingerprint(user.password)
        if user.password != password_hash and (mirror is None or lms_unchanged):
            user.password = password_hash
            changed_fields.append("password")

        if user.role != role:
            user.role = role
            changed_fields.append("role")
        if user.is_active != bool(is_active):
            user.is_active = bool(is_active)
            changed_fields.append("is_active")
        if not user.first_name and display_name:
            first, _, last = display_name.strip().partition(" ")
            user.first_name, user.last_name = first, last.strip()
            changed_fields += ["first_name", "last_name"]

        if changed_fields:
            user.save(update_fields=list(dict.fromkeys(changed_fields + ["updated_at"])))
            updated += 1
        _remember(user)

    return {"created": created, "updated": updated, "skipped": skipped}


def push_all() -> int:
    """Push every active teacher/admin (used by the periodic sync)."""
    pushed = 0
    for user in User.objects.filter(role__in=SHARED_ROLES).iterator():
        if push_user(user):
            pushed += 1
    return pushed


def sync() -> dict:
    pulled = pull_users()
    pushed = push_all()
    return {**pulled, "pushed": pushed}
