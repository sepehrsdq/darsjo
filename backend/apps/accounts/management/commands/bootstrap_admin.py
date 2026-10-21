"""Create (or repair) the first admin account from env. Idempotent."""

import os
import secrets

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

User = get_user_model()


class Command(BaseCommand):
    help = "Create the initial admin user if no admin exists (or reset it with --force-password)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--force-password",
            action="store_true",
            help="Reset the admin password to ADMIN_PASSWORD even if the account already exists.",
        )

    def handle(self, *args, **options):
        username = (os.environ.get("ADMIN_USERNAME") or "admin").strip().lower()
        password = os.environ.get("ADMIN_PASSWORD") or secrets.token_urlsafe(12)

        existing = User.objects.filter(role="admin").first()
        user = User.objects.filter(username=username).first()

        if existing and not options["force_password"]:
            self.stdout.write(f"admin already exists: {existing.username}")
            return

        if user is None:
            user = User(
                username=username,
                first_name="مدیر",
                last_name="سامانه",
                role="admin",
                is_staff=True,
                is_superuser=True,
                is_active=True,
            )
        user.role = "admin"
        user.is_active = True
        user.is_staff = True
        user.is_superuser = True
        user.must_change_password = False
        user.set_password(password)
        user.save()

        from apps.accounts.ftp import sync_ftp_account
        from apps.accounts.portal import push_user

        sync_ftp_account(user, plain_password=password)
        push_user(user)
        self.stdout.write(self.style.SUCCESS(f"admin ready: {user.username} / {password}"))
