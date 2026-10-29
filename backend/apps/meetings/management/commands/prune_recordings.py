from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.meetings.bbb import BBBClient, BBBError
from apps.meetings.models import Recording


class Command(BaseCommand):
    help = "Delete recordings older than RECORDING_RETENTION_DAYS from BBB and the LMS."

    def add_arguments(self, parser):
        parser.add_argument("--days", type=int, default=None)
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, **options):
        days = options["days"] or settings.RECORDING_RETENTION_DAYS
        cutoff = timezone.now() - timedelta(days=days)
        stale = Recording.objects.filter(is_deleted=False).filter(
            published_at__lt=cutoff
        ) | Recording.objects.filter(is_deleted=False, published_at__isnull=True, created_at__lt=cutoff)
        stale = stale.distinct()

        ids = list(stale.values_list("record_id", flat=True))
        self.stdout.write(f"{len(ids)} recording(s) older than {days} days")
        if not ids or options["dry_run"]:
            return

        client = BBBClient()
        deleted = 0
        for chunk_start in range(0, len(ids), 40):
            chunk = ids[chunk_start : chunk_start + 40]
            try:
                client.delete_recordings(chunk)
            except BBBError as exc:
                self.stderr.write(f"BBB delete failed for chunk: {exc}")
                continue
            Recording.objects.filter(record_id__in=chunk).update(is_deleted=True)
            deleted += len(chunk)
        self.stdout.write(self.style.SUCCESS(f"deleted {deleted} recording(s)"))
