"""Remove every demo/test account and start from a clean school.

The school asked to keep only the real manager account after the pilot. This
command is intentionally explicit: it refuses to run without ``--yes`` and has
a ``--dry-run`` mode so it can be inspected first.

It never touches the file panel's teacher rows except to deactivate the accounts
that are about to disappear from the LMS.
"""

from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.academic.models import ClassRoom, Enrollment, Offering, ScheduleSlot, Subject
from apps.accounts.models import PortalAccount, User
from apps.audit.models import AuditLog
from apps.meetings.models import Recording, Session


class Command(BaseCommand):
    help = "Delete demo/test users, classes and offerings; keep only the real admin."

    def add_arguments(self, parser):
        parser.add_argument("--keep-username", default="admin", help="Account that must survive (default: admin)")
        parser.add_argument("--yes", action="store_true", help="Actually delete. Without it this is a dry run.")
        parser.add_argument("--keep-audit", action="store_true", help="Keep the old activity log entries.")

    @transaction.atomic
    def handle(self, *args, **options):
        keep = (options["keep_username"] or "admin").strip().lower()
        if not User.objects.filter(username=keep).exists():
            raise CommandError(f"account «{keep}» does not exist; refusing to delete everything")

        users_to_remove = User.objects.exclude(username=keep)
        removed_users = list(users_to_remove.values_list("username", flat=True))
        counts = {
            "users": users_to_remove.count(),
            "teachers": users_to_remove.filter(role="teacher").count(),
            "students": users_to_remove.filter(role="student").count(),
            "admins": users_to_remove.filter(role="admin").count(),
            "classes": ClassRoom.objects.count(),
            "subjects": Subject.objects.count(),
            "offerings": Offering.objects.count(),
            "sessions": Session.objects.count(),
            "recordings": Recording.objects.count(),
            "enrollments": Enrollment.objects.count(),
            "schedule": ScheduleSlot.objects.count(),
            "audit": AuditLog.objects.count(),
        }

        mode = "APPLY" if options["yes"] else "DRY RUN"
        self.stdout.write(self.style.WARNING(f"[{mode}] keeping only «{keep}»"))
        for key, value in counts.items():
            self.stdout.write(f"  {key:12s} {value}")

        if not options["yes"]:
            self.stdout.write(self.style.NOTICE("nothing was changed; add --yes to apply"))
            return

        # Deactivate the shared file-panel accounts before the LMS rows vanish.
        # A teacher who is re-created later will get a fresh row again.
        from apps.accounts.portal import push_user

        for user in users_to_remove.filter(role__in={"teacher", "admin"}):
            user.is_active = False
            user.save(update_fields=["is_active", "updated_at"])
            push_user(user)

        # PROTECT relations: offerings first, then subjects/classes.
        Offering.objects.all().delete()
        class_rooms = ClassRoom.objects.all()
        class_rooms.delete()
        Subject.objects.all().delete()
        # The rest cascades from the deleted users/offerings, but be explicit.
        ScheduleSlot.objects.all().delete()
        Enrollment.objects.all().delete()
        Session.objects.all().delete()
        Recording.objects.all().delete()
        # FTP rows are cascade-deleted with their user; the manager keeps his.
        PortalAccount.objects.exclude(username=keep).delete()
        users_to_remove.delete()
        if not options["keep_audit"]:
            AuditLog.objects.all().delete()

        cache.clear()
        self.stdout.write(self.style.SUCCESS(f"removed {len(removed_users)} account(s); school is clean"))
        self.stdout.write("remaining users: " + ", ".join(User.objects.values_list("username", flat=True)))
