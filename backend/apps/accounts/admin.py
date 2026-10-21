from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import FTPAccount, LoginAttempt, User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "is_active", "must_change_password")
    list_filter = ("role", "is_active", "must_change_password")
    search_fields = ("username", "first_name", "last_name")
    ordering = ("last_name", "first_name")
    fieldsets = (
        (None, {"fields": ("username", "password")}),
        ("اطلاعات شخصی", {"fields": ("first_name", "last_name", "national_id", "phone", "avatar")}),
        ("نقش و دسترسی", {"fields": ("role", "is_active", "is_staff", "is_superuser", "must_change_password")}),
    )
    add_fieldsets = (
        (None, {"fields": ("username", "first_name", "last_name", "role", "password1", "password2")}),
    )


@admin.register(FTPAccount)
class FTPAccountAdmin(admin.ModelAdmin):
    list_display = ("ftp_username", "user", "enabled", "homedir", "synced_at")
    search_fields = ("ftp_username",)


@admin.register(LoginAttempt)
class LoginAttemptAdmin(admin.ModelAdmin):
    list_display = ("key", "failures", "locked_until", "updated_at")
