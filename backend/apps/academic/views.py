from django.db.models import Q
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.accounts.models import User
from apps.audit.services import log_action
from apps.core.exceptions import DomainError
from apps.core.permissions import IsAdmin, IsAdminOrTeacher
from apps.core.text import to_persian_digits
from apps.meetings.models import Recording, Session
from apps.meetings.serializers import RecordingSerializer
from apps.meetings.services import can_view_offering, offering_is_running, running_meeting_ids

from .models import ClassRoom, Enrollment, Offering, ScheduleSlot, Subject, offerings_for_student, offerings_for_teacher
from .serializers import (
    ClassRoomSerializer,
    EnrollmentSerializer,
    OfferingSerializer,
    OfferingWriteSerializer,
    SubjectSerializer,
)

from rest_framework.permissions import IsAuthenticated


class SubjectViewSet(viewsets.ModelViewSet):
    queryset = Subject.objects.all()
    serializer_class = SubjectSerializer
    permission_classes = [IsAuthenticated]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def destroy(self, request, *args, **kwargs):
        subject = self.get_object()
        offerings = subject.offerings.all()
        count = offerings.count()
        if count and request.query_params.get("force") != "1":
            raise DomainError(
                f"این درس در {to_persian_digits(count)} ارائه استفاده شده است. "
                "برای حذف، تأیید کنید تا آن ارائه‌ها هم پاک شوند.",
                code="in_use",
                status_code=409,
            )
        running = running_meeting_ids()
        if Session.objects.filter(offering__subject=subject, meeting_id__in=running).exists():
            raise DomainError(
                "یکی از کلاس‌های این درس همین حالا در حال برگزاری است. اول کلاس را پایان دهید.",
                code="class_running",
                status_code=409,
            )
        title = subject.title
        offerings.delete()
        subject.delete()
        log_action(
            "subject.delete",
            user=request.user,
            request=request,
            meta={"title": title, "offerings": count},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class ClassRoomViewSet(viewsets.ModelViewSet):
    queryset = ClassRoom.objects.all()
    serializer_class = ClassRoomSerializer

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def destroy(self, request, *args, **kwargs):
        classroom = self.get_object()
        offerings = classroom.offerings.all()
        running = running_meeting_ids()
        if Session.objects.filter(offering__class_room=classroom, meeting_id__in=running).exists():
            raise DomainError(
                "این کلاس همین حالا در حال برگزاری است. اول کلاس را پایان دهید.",
                code="class_running",
                status_code=409,
            )
        name = classroom.name
        offering_count = offerings.count()
        student_count = classroom.enrollments.count()
        classroom.delete()
        log_action(
            "class.delete",
            user=request.user,
            request=request,
            meta={"name": name, "offerings": offering_count, "students": student_count},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"], url_path="students")
    def students(self, request, pk=None):
        classroom = self.get_object()
        enrollments = classroom.enrollments.filter(is_active=True).select_related("student")
        return Response(EnrollmentSerializer(enrollments, many=True).data)

    @action(detail=True, methods=["get"], url_path="offerings")
    def offerings(self, request, pk=None):
        classroom = self.get_object()
        items = classroom.offerings.select_related("subject", "teacher", "class_room")
        return Response(OfferingSerializer(items, many=True).data)


class OfferingViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.action in {"create", "update", "partial_update"}:
            return OfferingWriteSerializer
        return OfferingSerializer

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [IsAdmin()]
        return [IsAuthenticated()]

    def create(self, request, *args, **kwargs):
        write = OfferingWriteSerializer(data=request.data)
        write.is_valid(raise_exception=True)
        offering = write.save()
        log_action(
            "offering.create",
            user=request.user,
            request=request,
            target=offering,
            meta={"subject": offering.subject.title, "class": offering.class_room.name},
        )
        # Always answer with the read shape: the UI inserts the row immediately
        # and expects nested subject/teacher/classRoom objects.
        return Response(
            OfferingSerializer(offering, context={"request": request}).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        offering = self.get_object()
        write = OfferingWriteSerializer(offering, data=request.data, partial=partial)
        write.is_valid(raise_exception=True)
        offering = write.save()
        return Response(OfferingSerializer(offering, context={"request": request}).data)

    def destroy(self, request, *args, **kwargs):
        offering = self.get_object()
        if offering_is_running(offering):
            raise DomainError(
                "این کلاس همین حالا در حال برگزاری است. اول کلاس را پایان دهید.",
                code="class_running",
                status_code=409,
            )
        label = str(offering)
        offering.delete()
        log_action("offering.delete", user=request.user, request=request, meta={"label": label})
        return Response(status=status.HTTP_204_NO_CONTENT)

    def get_queryset(self):
        user = self.request.user
        base = (
            Offering.objects.select_related("subject", "teacher", "class_room")
            .prefetch_related("schedule", "sessions__recordings")
        )
        if user.role == "admin":
            qs = base
            class_id = self.request.query_params.get("class")
            teacher_id = self.request.query_params.get("teacher")
            if class_id:
                qs = qs.filter(class_room_id=class_id)
            if teacher_id:
                qs = qs.filter(teacher_id=teacher_id)
            return qs
        if user.role == "teacher":
            return base.filter(teacher=user)
        return offerings_for_student(user).prefetch_related("schedule", "sessions__recordings")

    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)

    def retrieve(self, request, *args, **kwargs):
        offering = self.get_object()
        data = OfferingSerializer(offering, context={"request": request}).data
        user = request.user
        if user.role in {"admin", "teacher"}:
            from apps.accounts.serializers import UserBriefSerializer

            students = User.objects.filter(
                enrollments__class_room=offering.class_room, enrollments__year=offering.year, enrollments__is_active=True
            ).distinct()
            data["students"] = UserBriefSerializer(students, many=True).data
        return Response(data)

    @action(detail=True, methods=["post"], url_path="schedule")
    def add_slot(self, request, pk=None):
        if request.user.role != "admin" and getattr(self.get_object(), "teacher_id", None) != request.user.pk:
            raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
        offering = self.get_object()
        from .serializers import ScheduleSlotSerializer

        serializer = ScheduleSlotSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        slot = serializer.save(offering=offering)
        return Response(ScheduleSlotSerializer(slot).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["delete"], url_path=r"schedule/(?P<slot_id>[^/.]+)")
    def delete_slot(self, request, pk=None, slot_id=None):
        offering = self.get_object()
        if request.user.role != "admin" and offering.teacher_id != request.user.pk:
            raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
        ScheduleSlot.objects.filter(pk=slot_id, offering=offering).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["get"])
    def recordings(self, request, pk=None):
        offering = self.get_object()
        if not can_view_offering(request.user, offering):
            raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
        qs = offering.recordings.filter(is_deleted=False)
        return Response(RecordingSerializer(qs, many=True).data)


class EnrollmentViewSet(viewsets.ModelViewSet):
    queryset = Enrollment.objects.select_related("student", "class_room")
    serializer_class = EnrollmentSerializer
    permission_classes = [IsAdminOrTeacher]

    def get_permissions(self):
        if self.action in {"list", "retrieve"}:
            return [IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        user = self.request.user
        qs = super().get_queryset()
        if user.role == "admin":
            return qs
        if user.role == "teacher":
            return qs.filter(class_room__offerings__teacher=user).distinct()
        return qs.filter(student=user)

    def perform_create(self, serializer):
        # one class per student per year is enforced by the DB constraint
        serializer.save()

    @action(detail=False, methods=["post"], url_path="assign")
    def assign(self, request):
        """Move or add a student to a class (idempotent per year)."""
        if request.user.role != "admin":
            raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
        student_id = request.data.get("student")
        class_id = request.data.get("class_room")
        student = User.objects.filter(pk=student_id, role="student").first()
        classroom = ClassRoom.objects.filter(pk=class_id).first()
        if not student or not classroom:
            raise DomainError("دانش‌آموز یا کلاس پیدا نشد.", code="not_found", status_code=404)
        enrollment, created = Enrollment.objects.update_or_create(
            student=student,
            year=classroom.year,
            defaults={"class_room": classroom, "is_active": True},
        )
        return Response(EnrollmentSerializer(enrollment).data, status=201 if created else 200)
