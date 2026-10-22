from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.accounts.serializers import UserBriefSerializer

from .models import ClassRoom, Enrollment, Offering, ScheduleSlot, Subject

User = get_user_model()


class SubjectSerializer(serializers.ModelSerializer):
    offeringCount = serializers.SerializerMethodField()

    class Meta:
        model = Subject
        fields = ["id", "title", "color", "icon", "offeringCount"]

    def get_offeringCount(self, obj):
        return obj.offerings.count()


class ClassRoomSerializer(serializers.ModelSerializer):
    studentCount = serializers.SerializerMethodField()
    offeringCount = serializers.SerializerMethodField()

    class Meta:
        model = ClassRoom
        fields = ["id", "name", "grade", "year", "studentCount", "offeringCount"]

    def get_studentCount(self, obj):
        return getattr(obj, "student_total", None) or obj.enrollments.filter(is_active=True).count()

    def get_offeringCount(self, obj):
        return obj.offerings.count()


class ScheduleSlotSerializer(serializers.ModelSerializer):
    weekdayLabel = serializers.CharField(source="get_weekday_display", read_only=True)

    class Meta:
        model = ScheduleSlot
        fields = ["id", "offering", "weekday", "weekdayLabel", "start_time", "end_time"]
        read_only_fields = ["offering"]


class OfferingSerializer(serializers.ModelSerializer):
    subject = SubjectSerializer(read_only=True)
    teacher = UserBriefSerializer(read_only=True)
    classRoom = ClassRoomSerializer(source="class_room", read_only=True)
    schedule = ScheduleSlotSerializer(many=True, read_only=True)
    filesPath = serializers.CharField(source="files_path", read_only=True)
    meetingsUrl = serializers.SerializerMethodField()
    studentCount = serializers.SerializerMethodField()
    recordingCount = serializers.SerializerMethodField()
    sessions = serializers.SerializerMethodField()
    nextSessionNumber = serializers.SerializerMethodField()
    isRunning = serializers.SerializerMethodField()
    guestUrl = serializers.SerializerMethodField()

    class Meta:
        model = Offering
        fields = [
            "id", "subject", "teacher", "classRoom", "year", "is_active",
            "schedule", "filesPath", "meetingsUrl", "studentCount", "recordingCount",
            "sessions", "nextSessionNumber", "isRunning", "guestUrl",
        ]

    def get_meetingsUrl(self, obj):
        return f"https://files.example.ir/#files?path={obj.files_path}"

    def get_studentCount(self, obj):
        return obj.class_room.enrollments.filter(is_active=True).count()

    def get_recordingCount(self, obj):
        return obj.recordings.filter(is_deleted=False).count()

    def get_sessions(self, obj):
        from apps.meetings.serializers import SessionSerializer

        return SessionSerializer(obj.sessions.all(), many=True).data

    def get_nextSessionNumber(self, obj):
        from apps.meetings.services import next_session_number

        return next_session_number(obj)

    def get_isRunning(self, obj):
        from apps.meetings.services import offering_is_running

        return offering_is_running(obj)

    def get_guestUrl(self, obj):
        from apps.meetings.services import guest_url

        return guest_url(obj)


class OfferingWriteSerializer(serializers.ModelSerializer):
    class_room = serializers.PrimaryKeyRelatedField(queryset=ClassRoom.objects.all())
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all())
    teacher = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role="teacher"))

    class Meta:
        model = Offering
        fields = ["id", "class_room", "subject", "teacher", "year", "is_active"]

    def validate(self, attrs):
        if self.instance:
            year = attrs.get("year") or self.instance.year
        else:
            year = attrs.get("year")
        qs = Offering.objects.filter(
            class_room=attrs.get("class_room", getattr(self.instance, "class_room", None)),
            subject=attrs.get("subject", getattr(self.instance, "subject", None)),
            year=year,
        )
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("این درس قبلاً برای این کلاس در همین سال ثبت شده است.")
        return attrs


class EnrollmentSerializer(serializers.ModelSerializer):
    studentName = serializers.CharField(source="student.full_name", read_only=True)
    studentUsername = serializers.CharField(source="student.username", read_only=True)
    classRoomName = serializers.CharField(source="class_room.name", read_only=True)

    class Meta:
        model = Enrollment
        fields = ["id", "student", "studentName", "studentUsername", "class_room", "classRoomName", "year", "is_active"]
