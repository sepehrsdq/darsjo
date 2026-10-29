import os
from pathlib import Path

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Max
from django.http import FileResponse, Http404, HttpResponseRedirect
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from apps.academic.models import Offering
from apps.audit.services import client_ip, log_action
from apps.core.exceptions import DomainError
from apps.core.text import to_persian_digits

from .models import GuestAttendance, Recording, Session
from .portal_sync import verify_download_token
from .serializers import SessionSerializer
from .services import (
    can_view_offering,
    create_session,
    delete_session,
    end_class,
    end_session,
    guest_join,
    guest_offering,
    join_session,
    meeting_status,
    running_session_for,
    start_class,
    start_session,
    student_join,
    sync_recordings,
    update_session,
)


def _offering(offering_id):
    offering = (
        Offering.objects.select_related("subject", "class_room", "teacher").filter(pk=offering_id).first()
    )
    if not offering:
        raise DomainError("ارائهٔ درس پیدا نشد.", code="not_found", status_code=404)
    return offering


def _session(session_id):
    session = (
        Session.objects.select_related("offering", "offering__subject", "offering__class_room", "offering__teacher")
        .filter(pk=session_id)
        .first()
    )
    if not session:
        raise DomainError("جلسه پیدا نشد.", code="not_found", status_code=404)
    return session


# ---------------------------------------------------------------------------
# Sessions


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_session_view(request, offering_id):
    offering = _offering(offering_id)
    session = create_session(
        request.user,
        offering,
        number=request.data.get("number"),
        title=request.data.get("title", ""),
    )
    log_action(
        "session.create",
        user=request.user,
        request=request,
        target=offering,
        meta={"number": session.number, "title": session.title},
    )
    return Response(SessionSerializer(session).data, status=status.HTTP_201_CREATED)


@api_view(["PATCH", "DELETE"])
@permission_classes([IsAuthenticated])
def session_detail_view(request, session_id):
    session = _session(session_id)
    if request.method == "DELETE":
        number = session.number
        delete_session(request.user, session)
        log_action(
            "session.delete",
            user=request.user,
            request=request,
            meta={"offering": session.offering_id, "number": number},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)

    session = update_session(
        request.user,
        session,
        number=request.data.get("number"),
        title=request.data.get("title") if "title" in request.data else None,
    )
    log_action(
        "session.update",
        user=request.user,
        request=request,
        meta={"offering": session.offering_id, "number": session.number},
    )
    return Response(SessionSerializer(session).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_session_view(request, session_id):
    session = _session(session_id)
    result = start_session(request.user, session)
    log_action(
        "bbb.start",
        user=request.user,
        request=request,
        target=session.offering,
        meta={"session": session.number, "created": result["created"]},
    )
    return Response(
        {
            "joinUrl": result["url"],
            "sessionId": str(session.pk),
            "recordingAllowed": result["recordingAllowed"],
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join_session_view(request, session_id):
    session = _session(session_id)
    url = join_session(request.user, session)
    log_action(
        "bbb.join",
        user=request.user,
        request=request,
        target=session.offering,
        meta={"role": request.user.role, "session": session.number},
    )
    return Response({"joinUrl": url})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_session_view(request, session_id):
    session = _session(session_id)
    closed = end_session(request.user, session)
    log_action(
        "bbb.end",
        user=request.user,
        request=request,
        target=session.offering,
        meta={"session": session.number, "closed": closed},
    )
    return Response({"ok": True, "closed": closed})


# ---------------------------------------------------------------------------
# Guest link: pupils join with a name, no LMS account


@api_view(["GET"])
@permission_classes([AllowAny])
def guest_info_view(request, token):
    offering = guest_offering(token)
    session = running_session_for(offering)
    return Response(
        {
            "school": settings.SCHOOL_NAME,
            "offeringTitle": offering.subject.title,
            "subjectColor": offering.subject.color,
            "className": offering.class_room.name,
            "teacherName": offering.teacher.full_name,
            "running": session is not None,
            "sessionNumber": session.number if session else None,
            "sessionNumberLabel": to_persian_digits(session.number) if session else "",
            "title": session.title if session else "",
            "statusLabel": "در حال برگزاری" if session else "در انتظار شروع",
        }
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def guest_join_view(request, token):
    ip = client_ip(request)
    key = f"guest-join:{ip or 'unknown'}"
    attempts = cache.get(key, 0)
    # A whole classroom often shares one school NAT address, so the ceiling has
    # to cover a full hall of pupils, not just one device.
    if attempts >= 500:
        raise DomainError(
            "تلاش‌های ورود زیاد بوده است؛ چند دقیقه بعد دوباره امتحان کنید.",
            code="rate_limited",
            status_code=429,
        )
    cache.set(key, attempts + 1, 600)

    result = guest_join(
        token,
        request.data.get("firstName"),
        request.data.get("lastName"),
        ip=ip,
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )
    log_action(
        "bbb.guest_join",
        request=request,
        target=result["session"].offering,
        meta={"session": result["session"].number},
    )
    return Response({"joinUrl": result["url"]})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def offering_guests_view(request, offering_id):
    """Guest attendance for this lesson, across all of its sessions."""
    offering = _offering(offering_id)
    if request.user.role != "admin" and (
        request.user.role != "teacher" or offering.teacher_id != request.user.pk
    ):
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    rows = (
        GuestAttendance.objects.filter(session__offering=offering)
        .values("full_name", "session__number")
        .annotate(joined_at=Max("joined_at"), visits=Count("id"))
        .order_by("-joined_at")[:60]
    )
    items = [
        {
            "fullName": row["full_name"],
            "joinedAt": row["joined_at"],
            "sessionNumber": row["session__number"],
            "sessionNumberLabel": to_persian_digits(row["session__number"]),
            "visits": row["visits"],
        }
        for row in rows
    ]
    return Response({"items": items, "total": len(items)})


# ---------------------------------------------------------------------------
# Lesson-level compatibility endpoints (used by the dashboard cards)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def start_meeting(request, offering_id):
    offering = _offering(offering_id)
    if request.user.role != "teacher":
        raise DomainError("شروع کلاس فقط با معلم آن درس است.", code="teacher_only", status_code=403)
    result = start_class(request.user, offering)
    log_action(
        "bbb.start",
        user=request.user,
        request=request,
        target=offering,
        meta={"created": result["created"], "session": result["session"].number},
    )
    return Response(
        {
            "joinUrl": result["url"],
            "created": result["created"],
            "sessionId": str(result["session"].pk),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def join_meeting(request, offering_id):
    offering = _offering(offering_id)
    if request.user.role == "admin":
        raise DomainError(
            "مدیر به کلاس وارد نمی‌شود؛ کلاس را معلم درس شروع می‌کند.",
            code="teacher_only",
            status_code=403,
        )
    if not can_view_offering(request.user, offering):
        raise DomainError("شما به این کلاس دسترسی ندارید.", code="forbidden", status_code=403)
    url = start_class(request.user, offering)["url"] if request.user.role == "teacher" else student_join(
        request.user, offering
    )
    log_action("bbb.join", user=request.user, request=request, target=offering, meta={"role": request.user.role})
    return Response({"joinUrl": url})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def meeting_state(request, offering_id):
    offering = _offering(offering_id)
    if not can_view_offering(request.user, offering):
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    return Response({"isRunning": meeting_status(offering)})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def end_meeting(request, offering_id):
    offering = _offering(offering_id)
    if request.user.role != "admin" and offering.teacher_id != request.user.pk:
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    closed = end_class(request.user, offering)
    log_action("bbb.end", user=request.user, request=request, target=offering, meta={"closed": closed})
    return Response({"ok": True, "closedSessions": closed})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refresh_recordings(request, offering_id):
    offering = _offering(offering_id)
    if not can_view_offering(request.user, offering):
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    count = sync_recordings(offering)
    return Response({"synced": count, "at": timezone.now()})


# ---------------------------------------------------------------------------
# Recording download (signed link so the file panel can offer it)


def _recording_file(record_id):
    root = Path(settings.RECORDINGS_ROOT).resolve()
    base = (root / record_id).resolve()
    if root not in base.parents and base != root:
        return None
    if not base.is_dir():
        return None
    preferred = base / "video" / "webcams.webm"
    if preferred.is_file():
        return preferred
    candidates = []
    for current, _dirs, files in os.walk(base):
        for name in files:
            if name.lower().endswith((".mp4", ".webm", ".mkv", ".mov")):
                path = Path(current) / name
                try:
                    candidates.append((path.stat().st_size, path))
                except OSError:
                    continue
    if not candidates:
        return None
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


@api_view(["GET"])
@permission_classes([AllowAny])
def recording_download(request, recording_id):
    recording = Recording.objects.select_related("offering", "session").filter(pk=recording_id, is_deleted=False).first()
    if not recording:
        raise Http404
    allowed = verify_download_token(recording, request.query_params.get("token"))
    if not allowed and request.user.is_authenticated:
        allowed = can_view_offering(request.user, recording.offering)
    if not allowed:
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)

    path = _recording_file(recording.record_id)
    if path is None:
        if recording.playback_url:
            return HttpResponseRedirect(recording.playback_url)
        raise Http404
    suffix = path.suffix or ".webm"
    number = recording.session.number if recording.session_id else 0
    filename = f"session-{number}-{recording.record_id[:8]}{suffix}"
    return FileResponse(open(path, "rb"), as_attachment=True, filename=filename)
