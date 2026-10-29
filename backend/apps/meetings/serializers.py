from rest_framework import serializers

from apps.core.text import to_persian_digits

from .models import Recording, Session
from .services import running_meeting_ids


class RecordingSerializer(serializers.ModelSerializer):
    duration = serializers.SerializerMethodField()
    sessionId = serializers.IntegerField(source="session_id", read_only=True, allow_null=True)

    class Meta:
        model = Recording
        fields = [
            "id",
            "record_id",
            "sessionId",
            "name",
            "playback_url",
            "duration_seconds",
            "duration",
            "published_at",
        ]

    def get_duration(self, obj):
        minutes, seconds = divmod(obj.duration_seconds or 0, 60)
        return to_persian_digits(f"{minutes}:{seconds:02d}")


class SessionSerializer(serializers.ModelSerializer):
    numberLabel = serializers.SerializerMethodField()
    label = serializers.SerializerMethodField()
    statusLabel = serializers.CharField(source="get_status_display", read_only=True)
    date = serializers.DateTimeField(source="session_date", read_only=True)
    isRunning = serializers.SerializerMethodField()
    isRecorded = serializers.SerializerMethodField()
    recordings = serializers.SerializerMethodField()
    recordingCount = serializers.SerializerMethodField()
    guestCount = serializers.SerializerMethodField()

    class Meta:
        model = Session
        fields = [
            "id",
            "offering",
            "number",
            "numberLabel",
            "title",
            "label",
            "status",
            "statusLabel",
            "date",
            "created_at",
            "started_at",
            "ended_at",
            "isRunning",
            "isRecorded",
            "recordings",
            "recordingCount",
            "guestCount",
        ]

    def _recordings(self, obj):
        cached = getattr(obj, "_session_recordings", None)
        if cached is None:
            cached = [item for item in obj.recordings.all() if not item.is_deleted]
            obj._session_recordings = cached
        return cached

    def get_numberLabel(self, obj):
        return to_persian_digits(obj.number)

    def get_label(self, obj):
        base = f"جلسه {to_persian_digits(obj.number)}"
        return f"{base} — {obj.title}" if obj.title else base

    def get_isRunning(self, obj):
        return obj.meeting_id in running_meeting_ids()

    def get_isRecorded(self, obj):
        return bool(self._recordings(obj))

    def get_recordingCount(self, obj):
        return len(self._recordings(obj))

    def get_recordings(self, obj):
        return RecordingSerializer(self._recordings(obj), many=True).data

    def get_guestCount(self, obj):
        return obj.guest_visits.count()
