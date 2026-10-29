from django.conf import settings
from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.core.text import to_persian_digits


class Session(models.Model):
    """یک جلسهٔ مشخص از یک درس؛ اتاق BBB و ضبط مخصوص همین جلسه است."""

    class Status(models.TextChoices):
        PLANNED = "planned", "در انتظار شروع"
        RUNNING = "running", "در حال برگزاری"
        ENDED = "ended", "پایان‌یافته"

    offering = models.ForeignKey("academic.Offering", on_delete=models.CASCADE, related_name="sessions")
    number = models.PositiveSmallIntegerField("شمارهٔ جلسه")
    title = models.CharField("عنوان جلسه", max_length=120, blank=True)
    meeting_id = models.CharField(max_length=120, unique=True, db_index=True)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="started_sessions"
    )
    created_at = models.DateTimeField("تاریخ ثبت", auto_now_add=True)
    started_at = models.DateTimeField("شروع", null=True, blank=True)
    ended_at = models.DateTimeField("پایان", null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PLANNED)

    class Meta:
        verbose_name = "جلسهٔ کلاس"
        verbose_name_plural = "جلسه‌های کلاس"
        ordering = ["number"]
        constraints = [
            models.UniqueConstraint(fields=["offering", "number"], name="uniq_session_number_per_offering"),
            models.UniqueConstraint(
                fields=["offering"], condition=Q(status="running"), name="uniq_running_session_per_offering"
            ),
        ]

    def __str__(self):
        return f"{self.offering} — جلسه {self.number}"

    @property
    def label(self):
        base = f"جلسه {to_persian_digits(self.number)}"
        return f"{base} — {self.title}" if self.title else base

    @property
    def session_date(self):
        return self.started_at or self.created_at

    @property
    def duration_seconds(self):
        end = self.ended_at or timezone.now()
        start = self.started_at
        if start is None:
            return 0
        return max(int((end - start).total_seconds()), 0)

    @property
    def has_recording(self):
        return self.recordings.filter(is_deleted=False).exists()


class GuestAttendance(models.Model):
    """A pupil who entered through the lesson's permanent guest link."""

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name="guest_visits")
    full_name = models.CharField("نام مهمان", max_length=80)
    ip = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=300, blank=True)
    joined_at = models.DateTimeField("زمان ورود", auto_now_add=True)

    class Meta:
        verbose_name = "ورود مهمان"
        verbose_name_plural = "ورودهای مهمان"
        ordering = ["-joined_at"]

    def __str__(self):
        return f"{self.full_name} — {self.session}"


class Recording(models.Model):
    record_id = models.CharField("شناسهٔ ضبط", max_length=120, unique=True)
    offering = models.ForeignKey("academic.Offering", on_delete=models.CASCADE, related_name="recordings")
    session = models.ForeignKey(
        Session, null=True, blank=True, on_delete=models.SET_NULL, related_name="recordings"
    )
    name = models.CharField(max_length=200, blank=True)
    playback_url = models.URLField(max_length=500, blank=True)
    duration_seconds = models.PositiveIntegerField(default=0)
    size_bytes = models.BigIntegerField(default=0)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)

    class Meta:
        verbose_name = "ضبط کلاس"
        verbose_name_plural = "ضبط‌ها"
        ordering = ["-published_at", "-created_at"]

    def __str__(self):
        return self.name or self.record_id
