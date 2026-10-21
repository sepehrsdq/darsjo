"""Login throttling: database-backed, shared by all workers, resets on success."""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import LoginAttempt


def throttle_key(username, ip):
    return f"{(username or '').strip().lower()}|{ip or 'unknown'}"


def lock_remaining_seconds(key):
    row = LoginAttempt.objects.filter(key=key).first()
    if not row or not row.locked_until:
        return 0
    remaining = (row.locked_until - timezone.now()).total_seconds()
    if remaining <= 0:
        row.delete()
        return 0
    return int(remaining)


def register_failure(key):
    row, _ = LoginAttempt.objects.get_or_create(key=key)
    row.failures += 1
    if row.failures >= settings.LOGIN_MAX_FAILURES:
        row.locked_until = timezone.now() + timedelta(minutes=settings.LOGIN_LOCK_MINUTES)
        row.failures = 0
    row.save(update_fields=["failures", "locked_until", "updated_at"])
    LoginAttempt.objects.filter(
        updated_at__lt=timezone.now() - timedelta(days=1), locked_until__isnull=True
    ).delete()


def reset_failures(key):
    LoginAttempt.objects.filter(key=key).delete()
