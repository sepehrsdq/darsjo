from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("meetings", "0003_session_guest_link"),
        ("academic", "0003_offering_guest_token"),
    ]

    operations = [
        migrations.RemoveField(model_name="session", name="guest_token"),
        migrations.RemoveField(model_name="session", name="guest_link_enabled"),
    ]
