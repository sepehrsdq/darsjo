"""Delete audit entries outside the retention window.

The school asked for a small, fast trail: everything older than a week is
removed automatically so the table (and the admin page) stays light.
"""

from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.audit.models import AuditLog


class Command(BaseCommand):
    help = "Delete audit log entries older than the retention window (default 7 days)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=settings.AUDIT_RETENTION_DAYS,
            help="Keep entries newer than this many days (default: settings.AUDIT_RETENTION_DAYS).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Only report how many entries would be deleted.",
        )

    def handle(self, *args, **options):
        days = max(1, options["days"])
        cutoff = timezone.now() - timedelta(days=days)
        queryset = AuditLog.objects.filter(created_at__lt=cutoff)
        count = queryset.count()

        if options["dry_run"]:
            self.stdout.write(
                f"{count} audit entries older than {cutoff:%Y-%m-%d %H:%M} would be deleted."
            )
            return

        deleted, _ = queryset.delete()
        self.stdout.write(
            self.style.SUCCESS(
                f"Deleted {deleted} audit entries older than {cutoff:%Y-%m-%d %H:%M}."
            )
        )
