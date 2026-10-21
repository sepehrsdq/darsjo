import io
import secrets

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.db.models import Count, Q
from django.utils import timezone
from PIL import Image, UnidentifiedImageError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.academic.models import ClassRoom, Enrollment, Offering, Subject, offerings_for_student, offerings_for_teacher
from apps.academic.serializers import OfferingSerializer
from apps.audit.services import log_action
from apps.core.exceptions import DomainError
from apps.core.permissions import IsAdmin
from apps.meetings.models import Recording, Session

from .models import PortalAccount, User
from .portal import push_user
from .serializers import AdminUserCreateSerializer, UserSerializer, UserBriefSerializer

AVATAR_MAX_SIDE = 512


def _terminate_user_sessions(user):
    """Drop every existing login session for this user (used on deactivation)."""
    from django.contrib.sessions.models import Session as DjangoSession

    for session in DjangoSession.objects.filter(expire_date__gt=timezone.now()).iterator():
        try:
            data = session.get_decoded()
        except Exception:
            continue
        if str(data.get("_auth_user_id")) == str(user.pk):
            session.delete()


def profile_payload(user, request):
    serializer = UserSerializer(user, context={"request": request})
    data = dict(serializer.data)

    if user.role == "student":
        enrollment = (
            Enrollment.objects.filter(student=user, is_active=True)
            .select_related("class_room")
            .order_by("-year")
            .first()
        )
        data["classRoom"] = (
            {"id": str(enrollment.class_room.pk), "name": enrollment.class_room.name, "grade": enrollment.class_room.grade}
            if enrollment
            else None
        )
        data["offerings"] = OfferingSerializer(
            offerings_for_student(user).prefetch_related("schedule", "sessions__recordings"), many=True
        ).data
        data["editableFields"] = ["phone"]
    elif user.role == "teacher":
        data["classRoom"] = None
        data["offerings"] = OfferingSerializer(
            offerings_for_teacher(user).prefetch_related("schedule", "sessions__recordings"), many=True
        ).data
        data["editableFields"] = ["first_name", "last_name", "phone"]
    else:
        data["classRoom"] = None
        data["offerings"] = []
        data["editableFields"] = ["first_name", "last_name", "phone"]

    data["ftpUsername"] = user.username if user.role in {"teacher", "admin"} else None
    return data


class ProfileView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request):
        return Response(profile_payload(request.user, request))

    def patch(self, request):
        user = request.user
        editable = {"phone"}
        if user.role in {"admin", "teacher"}:
            editable |= {"first_name", "last_name"}

        changed = []
        for field in editable:
            if field in request.data:
                value = str(request.data.get(field) or "").strip()[:80]
                setattr(user, field, value)
                changed.append(field)

        if changed:
            user.save(update_fields=changed + ["updated_at"])
            if user.role in {"admin", "teacher"}:
                push_user(user)
            log_action("profile.update", user=user, request=request, meta={"fields": changed})
        return Response(profile_payload(user, request))


class AvatarView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        upload = request.FILES.get("avatar")
        if not upload:
            raise DomainError("فایلی انتخاب نشده است.", code="no_file")

        max_bytes = 2 * 1024 * 1024
        from django.conf import settings

        max_bytes = settings.MAX_AVATAR_BYTES
        if upload.size > max_bytes:
            raise DomainError("حجم تصویر باید کمتر از ۲ مگابایت باشد.", code="too_large")

        raw = upload.read()
        try:
            image = Image.open(io.BytesIO(raw))
            image.verify()
            image = Image.open(io.BytesIO(raw))
        except (UnidentifiedImageError, OSError):
            raise DomainError("فایل ارسالی تصویر معتبر نیست.", code="invalid_image")

        if image.format not in {"JPEG", "PNG", "WEBP"}:
            raise DomainError("فقط تصویر JPG، PNG یا WEBP پذیرفته می‌شود.", code="invalid_type")

        image = image.convert("RGB")
        image.thumbnail((AVATAR_MAX_SIDE, AVATAR_MAX_SIDE))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=88, optimize=True)

        user = request.user
        if user.avatar:
            user.avatar.delete(save=False)
        user.avatar.save(f"{user.username}-{int(timezone.now().timestamp())}.jpg", ContentFile(buffer.getvalue()), save=True)
        log_action("profile.avatar", user=user, request=request)
        return Response({"avatarUrl": user.avatar.url})


class AdminUserView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request, user_id=None):
        if user_id:
            user = User.objects.filter(pk=user_id).first()
            if not user:
                raise DomainError("کاربر پیدا نشد.", code="not_found", status_code=404)
            return Response(UserSerializer(user, context={"request": request}).data)

        qs = User.objects.all().order_by("role", "last_name")
        role = request.query_params.get("role")
        search = request.query_params.get("q")
        if role in {"admin", "teacher", "student"}:
            qs = qs.filter(role=role)
        if search:
            qs = qs.filter(Q(username__icontains=search) | Q(first_name__icontains=search) | Q(last_name__icontains=search))
        items = [UserSerializer(user, context={"request": request}).data for user in qs[:500]]
        return Response({"items": items, "total": qs.count()})

    def post(self, request):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        password = data.get("password") or ""
        generated_password = None
        if not password:
            if data["role"] == "student" and data.get("national_id"):
                password = data["national_id"]
            else:
                password = secrets.token_urlsafe(9)
                generated_password = password

        user = User.objects.create_user(
            username=data["username"],
            password=password,
            first_name=data["first_name"],
            last_name=data["last_name"],
            role=data["role"],
            national_id=data.get("national_id") or None,
            phone=data.get("phone", ""),
            must_change_password=data["role"] == "student",
        )
        if data["role"] in {"admin", "teacher"}:
            from .ftp import sync_ftp_account

            sync_ftp_account(user, plain_password=password)
            push_user(user)

        log_action("user.create", user=request.user, request=request, target=user, meta={"role": user.role})
        payload = UserSerializer(user, context={"request": request}).data
        if generated_password:
            payload["generatedPassword"] = generated_password
        return Response(payload, status=status.HTTP_201_CREATED)

    def patch(self, request, user_id):
        user = User.objects.filter(pk=user_id).first()
        if not user:
            raise DomainError("کاربر پیدا نشد.", code="not_found", status_code=404)
        fields = []
        deactivated = False
        for name in ["first_name", "last_name", "phone", "is_active"]:
            if name in request.data:
                value = request.data[name]
                if name == "is_active":
                    value = (
                        value
                        if isinstance(value, bool)
                        else str(value).strip().lower() not in {"false", "0", "no", "off", ""}
                    )
                    if user.pk == request.user.pk and not value:
                        raise DomainError(
                            "حساب خودتان را نمی‌توانید غیرفعال کنید.",
                            code="self_deactivate",
                        )
                    if user.is_active and not value:
                        deactivated = True
                else:
                    value = str(value).strip()[:80]
                setattr(user, name, value)
                fields.append(name)
        if "role" in request.data and request.data["role"] in {"admin", "teacher", "student"}:
            user.role = request.data["role"]
            fields.append("role")
        if fields:
            user.save(update_fields=fields + ["updated_at"])
            if deactivated or "role" in fields:
                from .ftp import sync_ftp_account

                sync_ftp_account(user)  # disables FTP when the account loses access
            if deactivated:
                _terminate_user_sessions(user)
            if user.role in {"admin", "teacher"}:
                push_user(user)
            log_action(
                "user.deactivate" if deactivated else "user.update",
                user=request.user,
                request=request,
                target=user,
                meta={"fields": fields},
            )
        return Response(UserSerializer(user, context={"request": request}).data)

    def delete(self, request, user_id):
        user = User.objects.filter(pk=user_id).first()
        if not user:
            raise DomainError("کاربر پیدا نشد.", code="not_found", status_code=404)
        if user.pk == request.user.pk:
            raise DomainError("حساب خودتان را نمی‌توانید حذف کنید.", code="self_delete")
        if user.teaching_offerings.exists():
            raise DomainError(
                "این معلم در یک یا چند درس استفاده می‌شود؛ اول معلم آن درس‌ها را عوض کنید یا درس را حذف کنید.",
                code="has_offerings",
                status_code=409,
            )

        username = user.username
        role = user.role
        log_action(
            "user.delete",
            user=request.user,
            request=request,
            target=user,
            meta={"username": username, "role": role},
        )
        _terminate_user_sessions(user)

        if role in {"admin", "teacher"}:
            from .portal import delete_user as delete_portal_user

            if not delete_portal_user(username):
                raise DomainError(
                    "حذف از سامانهٔ فایل انجام نشد؛ کمی بعد دوباره تلاش کنید. تا آن موقع حساب در هر دو سامانه می‌ماند.",
                    code="portal_delete_failed",
                    status_code=502,
                )

        PortalAccount.objects.filter(username__iexact=username).delete()
        if user.avatar:
            user.avatar.delete(save=False)
        user.delete()  # FTP row, enrollments and sessions cascade
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAdmin])
def reset_password(request, user_id):
    user = User.objects.filter(pk=user_id).first()
    if not user:
        raise DomainError("کاربر پیدا نشد.", code="not_found", status_code=404)

    if user.role == "student" and user.national_id:
        new_password = user.national_id
        user.must_change_password = True
        returned = None
    else:
        new_password = secrets.token_urlsafe(9)
        returned = new_password
        user.must_change_password = True

    user.set_password(new_password)
    user.save(update_fields=["password", "must_change_password", "updated_at"])
    if user.role in {"admin", "teacher"}:
        from .ftp import sync_ftp_account

        sync_ftp_account(user, plain_password=new_password)
        push_user(user)
    log_action("user.password_reset", user=request.user, request=request, target=user)
    return Response({"ok": True, "temporaryPassword": returned})


@api_view(["GET"])
@permission_classes([IsAdmin])
def dashboard_stats(request):
    now = timezone.now()
    active_sessions = Session.objects.filter(status=Session.Status.RUNNING)
    data = {
        "users": {
            "total": User.objects.count(),
            "students": User.objects.filter(role="student", is_active=True).count(),
            "teachers": User.objects.filter(role="teacher", is_active=True).count(),
            "admins": User.objects.filter(role="admin", is_active=True).count(),
            "inactive": User.objects.filter(is_active=False).count(),
        },
        "classes": ClassRoom.objects.count(),
        "subjects": Subject.objects.count(),
        "offerings": Offering.objects.filter(is_active=True).count(),
        "sessions": {
            "active": active_sessions.count(),
            "today": Session.objects.filter(started_at__date=now.date()).count(),
            "total": Session.objects.count(),
        },
        "recordings": {
            "total": Recording.objects.filter(is_deleted=False).count(),
            "sizeBytes": sum(Recording.objects.filter(is_deleted=False).values_list("size_bytes", flat=True)),
        },
        "classesPerGrade": list(
            ClassRoom.objects.values("grade").annotate(count=Count("id")).order_by("grade")
        ),
    }
    return Response(data)
