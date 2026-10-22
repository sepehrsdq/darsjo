import secrets

import apps.academic.models
from django.db import migrations, models


def fill_offering_tokens(apps, schema_editor):
    """Give every lesson one stable token, reusing a link already shared."""
    Offering = apps.get_model("academic", "Offering")
    Session = apps.get_model("meetings", "Session")
    for offering in Offering.objects.all().iterator():
        token = (
            Session.objects.filter(offering_id=offering.pk, guest_token__isnull=False)
            .order_by("number")
            .values_list("guest_token", flat=True)
            .first()
        )
        offering.guest_token = token or secrets.token_urlsafe(24)
        offering.save(update_fields=["guest_token"])


class Migration(migrations.Migration):
    dependencies = [
        ("academic", "0002_initial"),
        ("meetings", "0003_session_guest_link"),
    ]

    operations = [
        migrations.AddField(
            model_name="offering",
            name="guest_token",
            field=models.CharField(blank=True, db_index=True, max_length=64, null=True, unique=True),
        ),
        migrations.RunPython(fill_offering_tokens, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="offering",
            name="guest_token",
            field=models.CharField(
                db_index=True,
                default=apps.academic.models.new_guest_token,
                editable=False,
                max_length=64,
                unique=True,
                verbose_name="توکن لینک کلاس",
            ),
        ),
    ]
