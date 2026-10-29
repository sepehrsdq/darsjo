import django.utils.timezone
from django.db import migrations, models
from django.db.models import Q


def backfill_sessions(apps, schema_editor):
    Session = apps.get_model("meetings", "Session")
    Recording = apps.get_model("meetings", "Recording")

    offering_ids = list(Session.objects.values_list("offering_id", flat=True).distinct())
    for offering_id in offering_ids:
        sessions = list(
            Session.objects.filter(offering_id=offering_id).order_by("started_at", "created_at", "pk")
        )
        for index, session in enumerate(sessions, start=1):
            session.number = index
            session.title = session.title or ""
            session.meeting_id = f"darsjo-{offering_id}-s{index}"
            if session.started_at is None:
                session.started_at = session.created_at or django.utils.timezone.now()
            session.save(update_fields=["number", "title", "meeting_id", "started_at"])

        pending = Recording.objects.filter(offering_id=offering_id, session__isnull=True)
        if not pending.exists():
            continue
        first = Session.objects.filter(offering_id=offering_id).order_by("number").first()
        if first is None:
            first = Session.objects.create(
                offering_id=offering_id,
                number=1,
                title="",
                meeting_id=f"darsjo-{offering_id}-s1",
                status="ended",
                started_at=django.utils.timezone.now(),
                ended_at=django.utils.timezone.now(),
            )
        pending.update(session=first)


class Migration(migrations.Migration):
    dependencies = [
        ("meetings", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="session",
            name="number",
            field=models.PositiveSmallIntegerField(null=True, verbose_name="شمارهٔ جلسه"),
        ),
        migrations.AddField(
            model_name="session",
            name="title",
            field=models.CharField(blank=True, max_length=120, verbose_name="عنوان جلسه"),
        ),
        migrations.AddField(
            model_name="session",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now, verbose_name="تاریخ ثبت"),
            preserve_default=False,
        ),
        migrations.AlterField(
            model_name="session",
            name="started_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="شروع"),
        ),
        migrations.AlterField(
            model_name="session",
            name="status",
            field=models.CharField(
                choices=[
                    ("planned", "در انتظار شروع"),
                    ("running", "در حال برگزاری"),
                    ("ended", "پایان‌یافته"),
                ],
                default="planned",
                max_length=10,
            ),
        ),
        migrations.AlterField(
            model_name="session",
            name="ended_at",
            field=models.DateTimeField(blank=True, null=True, verbose_name="پایان"),
        ),
        migrations.AlterModelOptions(
            name="session",
            options={
                "ordering": ["number"],
                "verbose_name": "جلسهٔ کلاس",
                "verbose_name_plural": "جلسه‌های کلاس",
            },
        ),
        migrations.RemoveConstraint(
            model_name="session",
            name="uniq_running_session_per_offering",
        ),
        migrations.RunPython(backfill_sessions, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="session",
            name="number",
            field=models.PositiveSmallIntegerField(verbose_name="شمارهٔ جلسه"),
        ),
        migrations.AlterField(
            model_name="session",
            name="meeting_id",
            field=models.CharField(db_index=True, max_length=120, unique=True),
        ),
        migrations.AddConstraint(
            model_name="session",
            constraint=models.UniqueConstraint(fields=("offering", "number"), name="uniq_session_number_per_offering"),
        ),
        migrations.AddConstraint(
            model_name="session",
            constraint=models.UniqueConstraint(
                condition=Q(status="running"),
                fields=("offering",),
                name="uniq_running_session_per_offering",
            ),
        ),
    ]
