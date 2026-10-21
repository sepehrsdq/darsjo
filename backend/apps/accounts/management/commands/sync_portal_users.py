"""Two-way sync of teacher/admin accounts with the file panel database."""

from django.core.management.base import BaseCommand

from apps.accounts.portal import sync


class Command(BaseCommand):
    help = "Push LMS teachers/admins to the file panel and pull accounts created there."

    def handle(self, *args, **options):
        result = sync()
        self.stdout.write(
            self.style.SUCCESS(
                "portal sync: "
                f"{result['created']} new, {result['updated']} updated, "
                f"{result['pushed']} pushed, {result['skipped']} skipped"
            )
        )
