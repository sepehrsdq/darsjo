from django.contrib import admin

from .models import Recording, Session


@admin.register(Session)
class SessionAdmin(admin.ModelAdmin):
    list_display = ("offering", "started_at", "ended_at", "status")
    list_filter = ("status",)
    search_fields = ("offering__subject__title",)


@admin.register(Recording)
class RecordingAdmin(admin.ModelAdmin):
    list_display = ("name", "offering", "duration_seconds", "size_bytes", "published_at", "is_deleted")
    list_filter = ("is_deleted",)
    search_fields = ("record_id", "name")
