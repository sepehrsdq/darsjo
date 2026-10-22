import secrets

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.db.models import Q


def new_guest_token():
    """One permanent, unguessable link token for a lesson's guest classroom."""
    return secrets.token_urlsafe(24)


class ClassRoom(models.Model):
    """یک کلاس درس در یک سال تحصیلی، مثل «سوم الف»."""

    name = models.CharField("نام کلاس", max_length=60)
    grade = models.PositiveSmallIntegerField("پایه")
    year = models.CharField("سال تحصیلی", max_length=16, default=settings.DEFAULT_ACADEMIC_YEAR)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "کلاس"
        verbose_name_plural = "کلاس‌ها"
        ordering = ["grade", "name"]
        constraints = [models.UniqueConstraint(fields=["name", "year"], name="uniq_class_name_year")]

    def __str__(self):
        return f"{self.name} — {self.year}"

    @property
    def label(self):
        return self.name


class Subject(models.Model):
    title = models.CharField("عنوان درس", max_length=80, unique=True)
    color = models.CharField("رنگ", max_length=7, default="#0D9488")
    icon = models.CharField("آیکون", max_length=40, default="book")

    class Meta:
        verbose_name = "درس"
        verbose_name_plural = "درس‌ها"
        ordering = ["title"]

    def __str__(self):
        return self.title


class Offering(models.Model):
    """ارائهٔ یک درس در یک کلاس توسط یک معلم؛ اتاق BBB و پوشهٔ فایل به آن وصل است."""

    class_room = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="offerings")
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name="offerings")
    teacher = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="teaching_offerings",
        limit_choices_to={"role": "teacher"},
    )
    year = models.CharField("سال تحصیلی", max_length=16, default=settings.DEFAULT_ACADEMIC_YEAR)
    is_active = models.BooleanField("فعال", default=True)
    # One link for every session of this lesson. It stays the same all year;
    # it only lets pupils in while one of the sessions is running.
    guest_token = models.CharField(
        "توکن لینک کلاس", max_length=64, unique=True, db_index=True, default=new_guest_token, editable=False
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "ارائهٔ درس"
        verbose_name_plural = "ارائه‌های درس"
        ordering = ["class_room__grade", "class_room__name", "subject__title"]
        constraints = [
            models.UniqueConstraint(
                fields=["class_room", "subject", "year"], name="uniq_offering_class_subject_year"
            )
        ]

    def __str__(self):
        return f"{self.subject} — {self.class_room.name}"

    @property
    def folder_name(self):
        safe = lambda value: "".join(ch for ch in str(value) if ch not in '/\\:*?"<>|').strip()
        return f"{safe(self.class_room.name)}-{safe(self.subject.title)}"

    @property
    def files_path(self):
        return f"{self.teacher.username}/{self.folder_name}"


class ScheduleSlot(models.Model):
    WEEKDAYS = [
        (0, "شنبه"),
        (1, "یکشنبه"),
        (2, "دوشنبه"),
        (3, "سه‌شنبه"),
        (4, "چهارشنبه"),
        (5, "پنجشنبه"),
        (6, "جمعه"),
    ]

    offering = models.ForeignKey(Offering, on_delete=models.CASCADE, related_name="schedule")
    weekday = models.PositiveSmallIntegerField("روز هفته", choices=WEEKDAYS)
    start_time = models.TimeField("ساعت شروع")
    end_time = models.TimeField("ساعت پایان")

    class Meta:
        verbose_name = "زمان کلاس"
        verbose_name_plural = "برنامهٔ هفتگی"
        ordering = ["weekday", "start_time"]

    def __str__(self):
        return f"{self.get_weekday_display()} {self.start_time:%H:%M}–{self.end_time:%H:%M}"

    def clean(self):
        if self.start_time and self.end_time and self.start_time >= self.end_time:
            raise ValidationError({"end_time": "ساعت پایان باید بعد از ساعت شروع باشد."})
        if self.offering_id and self.start_time and self.end_time:
            clash = (
                ScheduleSlot.objects.filter(offering=self.offering, weekday=self.weekday)
                .exclude(pk=self.pk)
                .filter(Q(start_time__lt=self.end_time) & Q(end_time__gt=self.start_time))
            )
            if clash.exists():
                raise ValidationError("این بازه با یک زمان دیگر در همان ارائه هم‌پوشانی دارد.")


class Enrollment(models.Model):
    """عضویت دانش‌آموز در کلاس؛ هر دانش‌آموز در هر سال فقط یک کلاس دارد."""

    student = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="enrollments",
        limit_choices_to={"role": "student"},
    )
    class_room = models.ForeignKey(ClassRoom, on_delete=models.CASCADE, related_name="enrollments")
    year = models.CharField("سال تحصیلی", max_length=16, default=settings.DEFAULT_ACADEMIC_YEAR)
    is_active = models.BooleanField("فعال", default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "عضویت در کلاس"
        verbose_name_plural = "عضویت‌ها"
        ordering = ["class_room", "student__last_name"]
        constraints = [
            models.UniqueConstraint(fields=["student", "year"], name="uniq_student_year"),
        ]

    def __str__(self):
        return f"{self.student.full_name} → {self.class_room.name}"

    def save(self, *args, **kwargs):
        self.year = self.year or self.class_room.year
        super().save(*args, **kwargs)


def offerings_for_student(student, year=None):
    """All offerings a student can see, derived from the active class membership."""
    year = year or settings.DEFAULT_ACADEMIC_YEAR
    enrollment = (
        Enrollment.objects.filter(student=student, year=year, is_active=True)
        .select_related("class_room")
        .first()
    )
    if not enrollment:
        return Offering.objects.none()
    return Offering.objects.filter(
        class_room=enrollment.class_room, year=year, is_active=True
    ).select_related("subject", "teacher", "class_room")


def offerings_for_teacher(teacher, year=None):
    year = year or settings.DEFAULT_ACADEMIC_YEAR
    return Offering.objects.filter(teacher=teacher, year=year, is_active=True).select_related(
        "subject", "class_room", "teacher"
    )
