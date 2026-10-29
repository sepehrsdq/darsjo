from datetime import timedelta

from django.conf import settings
from django.core.cache import cache
from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.meetings.bbb import BBBClient, BBBError
from apps.meetings.models import Session
from apps.meetings.services import close_session


class Command(BaseCommand):
    help = "Close sessions whose BBB meeting is no longer running."

    def handle(self, *args, **options):
        try:
            running = {m["meeting_id"] for m in BBBClient().get_meetings() if m["running"]}
        except BBBError as exc:
            # Never close anything on a BBB hiccup: sessions are the source of
            # truth for "the teacher started the class".
            self.stderr.write(f"BBB unavailable, skipping reconcile: {exc}")
            return

        # A freshly created room reports running=false until the first person
        # joins, so give every new session a grace period.
        cutoff = timezone.now() - timedelta(minutes=settings.SESSION_START_GRACE_MINUTES)
        closed = 0
        for session in Session.objects.filter(
            status=Session.Status.RUNNING, started_at__lt=cutoff
        ):
            if session.meeting_id in running:
                continue
            close_session(session)
            closed += 1
        cache.delete("bbb:running:all")
        self.stdout.write(self.style.SUCCESS(f"closed {closed} stale session(s)"))
