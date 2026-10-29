import secrets

import django.db.models.deletion
from django.db import migrations, models


def fill_guest_tokens(apps, schema_editor):
    Session = apps.get_model("meetings", "Session")
    for session in Session.objects.filter(guest_token__isnull=True).iterator():
        session.guest_token = secrets.token_urlsafe(24)
        session.save(update_fields=["guest_token"])


class Migration(migrations.Migration):
    dependencies = [
        ("meetings", "0002_session_sessions"),
    ]

    operations = [
        migrations.AddField(
            model_name="session",
            name="guest_token",
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="session",
            name="guest_link_enabled",
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name="GuestAttendance",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("full_name", models.CharField(max_length=80, verbose_name="نام مهمان")),
                ("ip", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=300)),
                ("joined_at", models.DateTimeField(auto_now_add=True, verbose_name="زمان ورود")),
                (
                    "session",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="guest_visits",
                        to="meetings.session",
                    ),
                ),
            ],
            options={
                "verbose_name": "ورود مهمان",
                "verbose_name_plural": "ورودهای مهمان",
                "ordering": ["-joined_at"],
            },
        ),
        migrations.RunPython(fill_guest_tokens, migrations.RunPython.noop),
    ]
