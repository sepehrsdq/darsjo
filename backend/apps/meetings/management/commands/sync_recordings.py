from django.core.management.base import BaseCommand

from apps.meetings.bbb import BBBError
from apps.meetings.portal_sync import prune_portal_sessions
from apps.meetings.services import sync_recordings


class Command(BaseCommand):
    help = "Pull published recordings from BigBlueButton into the LMS."

    def handle(self, *args, **options):
        try:
            count = sync_recordings()
        except BBBError as exc:
            self.stderr.write(f"BBB error: {exc}")
            return
        pruned = prune_portal_sessions()
        self.stdout.write(self.style.SUCCESS(f"synced {count} recording(s), pruned {pruned}"))
