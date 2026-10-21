"""FTP account mirror (ProFTPD reads these rows directly from PostgreSQL).

Only admins and teachers get an FTP account. The password hash is a
SHA-512 crypt string that ProFTPD's mod_sql_passwd understands, while the
Django side keeps an Argon2 hash. `users` stays the single source of truth.
"""

from django.conf import settings
from passlib.hash import sha512_crypt

from .models import FTPAccount

FTP_UID = settings.FTP_UID
FTP_GID = settings.FTP_GID


def ftp_homedir(user):
    return str(settings.FILES_ROOT / user.username)


def sync_ftp_account(user, plain_password=None):
    """Create/update/disable the FTP mirror for a user. Returns the account or None."""
    should_exist = user.role in {"admin", "teacher"} and user.is_active
    account = FTPAccount.objects.filter(user=user).first()

    if not should_exist:
        if account:
            account.enabled = False
            account.save(update_fields=["enabled", "synced_at"])
        return None

    if plain_password:
        hashed = sha512_crypt.hash(plain_password, rounds=12000)
    elif account:
        hashed = account.password_hash
    else:
        return None  # no plaintext available yet; synced on the next password change

    account, _ = FTPAccount.objects.update_or_create(
        user=user,
        defaults={
            "ftp_username": user.username,
            "password_hash": hashed,
            "homedir": ftp_homedir(user),
            "uid": FTP_UID,
            "gid": FTP_GID,
            "enabled": True,
        },
    )
    return account
