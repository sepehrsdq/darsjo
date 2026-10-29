from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("audit", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="auditlog",
            name="method",
            field=models.CharField(blank=True, max_length=8),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="path",
            field=models.CharField(blank=True, db_index=True, max_length=300),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="status_code",
            field=models.PositiveSmallIntegerField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="duration_ms",
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="request_id",
            field=models.CharField(blank=True, db_index=True, max_length=32),
        ),
        migrations.AddField(
            model_name="auditlog",
            name="level",
            field=models.CharField(db_index=True, default="info", max_length=10),
        ),
    ]
