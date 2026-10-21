import uuid

from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.core.text import mask_national_id

from .managers import UserManager


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        ADMIN = "admin", "مدیر"
        TEACHER = "teacher", "معلم"
        STUDENT = "student", "دانش‌آموز"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField("نام کاربری", max_length=64, unique=True)
    first_name = models.CharField("نام", max_length=80)
    last_name = models.CharField("نام خانوادگی", max_length=80)
    national_id = models.CharField("کد ملی", max_length=10, unique=True, blank=True, null=True)
    role = models.CharField("نقش", max_length=10, choices=Role.choices, default=Role.STUDENT)
    phone = models.CharField("تلفن", max_length=20, blank=True)
    # The file panel's scrypt string (scrypt$N$r$p$salt$hash) is 130 chars,
    # while Django's default column is varchar(128).
    password = models.CharField("رمز عبور", max_length=255)
    avatar = models.ImageField("تصویر", upload_to="avatars/", blank=True, null=True)
    must_change_password = models.BooleanField("اجبار تغییر رمز", default=False)
    is_active = models.BooleanField("فعال", default=True)
    is_staff = models.BooleanField("دسترسی پنل جنگو", default=False)
    date_joined = models.DateTimeField("تاریخ عضویت", default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "username"
    REQUIRED_FIELDS = ["first_name", "last_name"]

    class Meta:
        verbose_name = "کاربر"
        verbose_name_plural = "کاربران"
        ordering = ["last_name", "first_name"]

    def __str__(self):
        return f"{self.full_name} ({self.username})"

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}".strip()

    @property
    def initials(self):
        first = self.first_name[:1] if self.first_name else ""
        last = self.last_name[:1] if self.last_name else ""
        return (first + last) or self.username[:2].upper()

    @property
    def masked_national_id(self):
        return mask_national_id(self.national_id or "")

    def save(self, *args, **kwargs):
        self.username = (self.username or "").strip().lower()
        super().save(*args, **kwargs)


class LoginAttempt(models.Model):
    """Database-backed login throttle so every gunicorn worker shares the state."""

    key = models.CharField(max_length=160, unique=True)
    failures = models.PositiveIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.key}: {self.failures}"


class PortalAccount(models.Model):
    """Tracks the last password hash shared with the file panel database."""

    username = models.CharField(max_length=64, unique=True)
    hash_fingerprint = models.CharField(max_length=64)
    synced_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "حساب همگام با پنل فایل"
        verbose_name_plural = "حساب‌های همگام با پنل فایل"

    def __str__(self):
        return self.username


class FTPAccount(models.Model):
    """Mirror of a teacher/admin account for ProFTPD (never created for students)."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="ftp_account")
    ftp_username = models.CharField(max_length=64, unique=True)
    password_hash = models.CharField(max_length=255)
    homedir = models.CharField(max_length=255)
    uid = models.PositiveIntegerField(default=1500)
    gid = models.PositiveIntegerField(default=1500)
    enabled = models.BooleanField(default=True)
    synced_at = models.DateTimeField(default=timezone.now)

    class Meta:
        verbose_name = "حساب FTP"
        verbose_name_plural = "حساب‌های FTP"

    def __str__(self):
        return self.ftp_username
