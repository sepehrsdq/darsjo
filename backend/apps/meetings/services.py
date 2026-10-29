"""Access-controlled BBB orchestration. All joins are built server side.

Every lesson (offering) is taught in numbered sessions. A session owns its own
BBB room, so the recording, the date and the session number always belong
together. The teacher creates the session first; only then can the room open.
"""

import hashlib
import logging
from datetime import datetime, timedelta, timezone as dt_timezone

from django.conf import settings
from django.core.cache import cache
from django.db import IntegrityError, transaction
from django.db.models import Max
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from apps.academic.models import Enrollment, Offering
from apps.core.exceptions import DomainError
from apps.core.text import to_persian_digits

from .bbb import BBBClient, BBBError
from .models import GuestAttendance, Recording, Session

logger = logging.getLogger(__name__)


def _secret(kind, offering_id):
    raw = f"{kind}:{offering_id}:{settings.SECRET_KEY}".encode()
    return hashlib.sha256(raw).hexdigest()[:12]


def _bbb_time(value):
    """BBB returns either an ISO string or epoch milliseconds."""
    if not value:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return parse_datetime(str(value))
    if number > 10_000_000_000:  # milliseconds
        number /= 1000
    try:
        return datetime.fromtimestamp(number, tz=dt_timezone.utc)
    except (OverflowError, OSError, ValueError):
        return None


def attendee_password(offering):
    return f"a{_secret('attendee', offering.pk)}"


def moderator_password(offering):
    return f"m{_secret('moderator', offering.pk)}"


def session_meeting_id(offering, number):
    return f"darsjo-{offering.pk}-s{number}"


def session_room_name(offering, session):
    name = f"{offering.subject.title} — {offering.class_room.name} — جلسه {to_persian_digits(session.number)}"
    if session.title:
        name = f"{name} ({session.title})"
    return name[:120]


def logout_url(offering):
    base = getattr(settings, "PUBLIC_BASE_URL", "https://kelaas.example.ir").rstrip("/")
    return f"{base}/offerings/{offering.pk}"


def guest_url(offering):
    """The lesson's one permanent link; the same URL for every session."""
    base = getattr(settings, "PUBLIC_BASE_URL", "https://kelaas.example.ir").rstrip("/")
    if not offering.guest_token:
        return ""
    return f"{base}/join/{offering.guest_token}"


def can_view_offering(user, offering):
    if user.role == "admin":
        return True
    if user.role == "teacher":
        return offering.teacher_id == user.pk
    if user.role == "student":
        return Enrollment.objects.filter(
            student=user, class_room=offering.class_room, year=offering.year, is_active=True
        ).exists()
    return False


def running_meeting_ids(client=None, ttl=8):
    """One getMeetings call gives the status of every room (cached briefly).

    BBB reports ``running=false`` for a room that was just created but has no
    participant yet. A teacher clicking «شروع کلاس» is the real "class started"
    signal, so a fresh local session also counts as running.
    """
    key = "bbb:running:all"
    cached = cache.get(key)
    if cached is not None:
        return set(cached)
    client = client or BBBClient()
    try:
        ids = {m["meeting_id"] for m in client.get_meetings() if m["running"]}
    except BBBError:
        ids = set()
    ids |= local_running_ids()
    cache.set(key, list(ids), ttl)
    return ids


def local_running_ids():
    """Sessions the teacher started recently and has not ended yet."""
    cutoff = timezone.now() - timedelta(minutes=settings.SESSION_START_GRACE_MINUTES)
    return set(
        Session.objects.filter(
            status=Session.Status.RUNNING,
            started_at__gte=cutoff,
        ).values_list("meeting_id", flat=True)
    )


def meeting_status(offering, client=None):
    ids = running_meeting_ids(client)
    return Session.objects.filter(offering=offering, meeting_id__in=ids).exists()


def offering_is_running(offering):
    ids = running_meeting_ids()
    return any(session.meeting_id in ids for session in offering.sessions.all())


def next_session_number(offering):
    current = offering.sessions.aggregate(value=Max("number"))["value"] or 0
    return current + 1


@transaction.atomic
def create_session(user, offering, number=None, title=""):
    """Create the numbered session before any room exists. Teacher only."""
    if user.role != "teacher":
        raise DomainError("ساخت جلسه فقط با معلم این درس است.", code="teacher_only", status_code=403)
    if offering.teacher_id != user.pk:
        raise DomainError("این ارائهٔ درس متعلق به شما نیست.", code="forbidden", status_code=403)

    if number in (None, ""):
        number = next_session_number(offering)
    try:
        number = int(number)
    except (TypeError, ValueError):
        raise DomainError("شمارهٔ جلسه باید یک عدد باشد.", code="invalid_number", status_code=400)
    if number < 1 or number > 200:
        raise DomainError("شمارهٔ جلسه باید بین ۱ و ۲۰۰ باشد.", code="invalid_number", status_code=400)
    if offering.sessions.filter(number=number).exists():
        raise DomainError(
            f"جلسهٔ شمارهٔ {number} برای این درس قبلاً ساخته شده است.",
            code="duplicate_number",
            status_code=409,
        )

    title = (title or "").strip()[:120]
    try:
        with transaction.atomic():
            session = Session.objects.create(
                offering=offering,
                number=number,
                title=title,
                meeting_id=session_meeting_id(offering, number),
                started_by=user,
                status=Session.Status.PLANNED,
            )
    except IntegrityError:
        raise DomainError(
            f"جلسهٔ شمارهٔ {number} برای این درس قبلاً ساخته شده است.",
            code="duplicate_number",
            status_code=409,
        )
    return session


def update_session(user, session, number=None, title=None):
    if user.role not in {"admin", "teacher"}:
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    if user.role == "teacher" and session.offering.teacher_id != user.pk:
        raise DomainError("این جلسه متعلق به شما نیست.", code="forbidden", status_code=403)

    fields = []
    if title is not None:
        session.title = str(title).strip()[:120]
        fields.append("title")
    if number is not None:
        try:
            new_number = int(number)
        except (TypeError, ValueError):
            raise DomainError("شمارهٔ جلسه باید یک عدد باشد.", code="invalid_number", status_code=400)
        if new_number == session.number:
            new_number = None
    else:
        new_number = None
    if new_number is not None:
        if session.status != Session.Status.PLANNED or session.recordings.exists():
            raise DomainError(
                "شمارهٔ جلسه‌ای که شروع شده یا ضبط دارد قابل تغییر نیست.",
                code="number_locked",
                status_code=409,
            )
        if new_number < 1 or new_number > 200:
            raise DomainError("شمارهٔ جلسه باید بین ۱ و ۲۰۰ باشد.", code="invalid_number", status_code=400)
        if session.offering.sessions.filter(number=new_number).exclude(pk=session.pk).exists():
            raise DomainError(
                f"جلسهٔ شمارهٔ {new_number} برای این درس قبلاً ساخته شده است.",
                code="duplicate_number",
                status_code=409,
            )
        session.number = new_number
        session.meeting_id = session_meeting_id(session.offering, new_number)
        fields += ["number", "meeting_id"]
    if fields:
        session.save(update_fields=fields)
    return session


def delete_session(user, session):
    if user.role not in {"admin", "teacher"}:
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    if user.role == "teacher" and session.offering.teacher_id != user.pk:
        raise DomainError("این جلسه متعلق به شما نیست.", code="forbidden", status_code=403)
    if session.status == Session.Status.RUNNING:
        raise DomainError("جلسهٔ در حال برگزاری را اول پایان دهید.", code="class_running", status_code=409)
    if session.recordings.filter(is_deleted=False).exists():
        raise DomainError(
            "این جلسه ضبط دارد و قابل حذف نیست. برای پاک‌کردن ضبط با مدیر تماس بگیرید.",
            code="has_recording",
            status_code=409,
        )
    if session.status == Session.Status.ENDED:
        ended_at = session.ended_at or session.started_at
        grace = timedelta(minutes=settings.RECORDING_GRACE_MINUTES)
        if ended_at and timezone.now() - ended_at < grace:
            raise DomainError(
                "این جلسه تازه پایان یافته و ممکن است ضبطش در حال پردازش باشد؛ کمی بعد دوباره تلاش کنید.",
                code="recording_pending",
                status_code=409,
            )
    session.delete()


def ensure_meeting(session, record, client=None):
    """Create this session's room if it is not running. Idempotent."""
    client = client or BBBClient()
    if client.is_meeting_running(session.meeting_id):
        cache.set(f"bbb:running:{session.offering_id}", True, 5)
        return False
    offering = session.offering
    try:
        client.create_meeting(
            meeting_id=session.meeting_id,
            name=session_room_name(offering, session),
            attendee_pw=attendee_password(offering),
            moderator_pw=moderator_password(offering),
            record=record,
            max_participants=max(offering.class_room.enrollments.count() + 5, 30),
            welcome=f"به جلسهٔ {to_persian_digits(session.number)} درس {offering.subject.title} خوش آمدید",
            logout_url=logout_url(offering),
            auto_start_recording=False,
        )
    except BBBError as exc:
        # A concurrent start can return "duplicate"; treat it as already running.
        if exc.message_key not in {"duplicateWarning", "idNotUnique"}:
            raise
    cache.set(f"bbb:running:{session.offering_id}", True, 5)
    return True


@transaction.atomic
def start_session(user, session, client=None):
    """Open the room of one session. Only its teacher may do this."""
    if user.role != "teacher":
        raise DomainError("شروع کلاس فقط با معلم آن درس است.", code="teacher_only", status_code=403)
    offering = session.offering
    if offering.teacher_id != user.pk:
        raise DomainError("این ارائهٔ درس متعلق به شما نیست.", code="forbidden", status_code=403)
    if session.status == Session.Status.ENDED:
        raise DomainError(
            "این جلسه پایان یافته است. برای ادامه، جلسهٔ تازه بسازید.",
            code="session_ended",
            status_code=409,
        )
    if session.status != Session.Status.RUNNING:
        other = (
            Session.objects.filter(offering=offering, status=Session.Status.RUNNING)
            .exclude(pk=session.pk)
            .exists()
        )
        if other:
            raise DomainError(
                "یک جلسهٔ دیگر از این درس در حال برگزاری است. اول آن را پایان دهید.",
                code="other_session_running",
                status_code=409,
            )

    client = client or BBBClient()
    # One recording per session: once a recording exists, the room opens with
    # recording disabled so the sound/video cannot be recorded again.
    record = not session.recordings.filter(is_deleted=False).exists()
    created = ensure_meeting(session, record=record, client=client)

    if session.status != Session.Status.RUNNING:
        session.status = Session.Status.RUNNING
        session.started_at = session.started_at or timezone.now()
        session.started_by = user
        session.ended_at = None
        session.save(update_fields=["status", "started_at", "started_by", "ended_at"])
    cache.delete("bbb:running:all")

    url = client.join_url(
        meeting_id=session.meeting_id,
        full_name=user.full_name or user.username,
        user_id=user.pk,
        role="MODERATOR",
        password=moderator_password(offering),
    )
    return {"url": url, "session": session, "created": created, "recordingAllowed": record}


def join_session(user, session, client=None):
    """Students may enter only a running session; the teacher always may.

    The admin never starts a class, but may quietly observe a running one to
    check that the room, sound and screen sharing are working.
    """
    offering = session.offering
    if not can_view_offering(user, offering):
        raise DomainError("شما به این کلاس دسترسی ندارید.", code="forbidden", status_code=403)
    if user.role == "teacher":
        return start_session(user, session, client=client)["url"]

    client = client or BBBClient()
    ids = running_meeting_ids(client)
    if session.status != Session.Status.RUNNING or session.meeting_id not in ids:
        raise DomainError("این جلسه هنوز شروع نشده است.", code="not_running", status_code=409)

    return client.join_url(
        meeting_id=session.meeting_id,
        full_name=user.full_name or user.username,
        user_id=f"admin-{user.pk}" if user.role == "admin" else user.pk,
        role="VIEWER",
        password=attendee_password(offering),
    )


def guest_offering(token):
    """Resolve the lesson behind its permanent guest link."""
    offering = (
        Offering.objects.select_related("subject", "class_room", "teacher").filter(guest_token=token).first()
    )
    if not offering:
        raise DomainError("این لینک معتبر نیست.", code="invalid_link", status_code=404)
    return offering


def running_session_for(offering, client=None):
    """The one session of this lesson that is live right now, if any."""
    ids = running_meeting_ids(client)
    return (
        Session.objects.filter(
            offering=offering,
            status=Session.Status.RUNNING,
            meeting_id__in=ids,
        )
        .order_by("-number")
        .first()
    )


def guest_join(token, first_name, last_name, ip=None, user_agent="", client=None):
    """Join the lesson's current running session as a named guest."""
    offering = guest_offering(token)

    first = " ".join(str(first_name or "").split())[:40]
    last = " ".join(str(last_name or "").split())[:40]
    if len(first) < 2 or len(last) < 2:
        raise DomainError(
            "نام و نام خانوادگی را کامل وارد کنید.",
            code="invalid_name",
            status_code=400,
        )

    client = client or BBBClient()
    session = running_session_for(offering, client)
    if session is None:
        raise DomainError(
            "کلاس هنوز شروع نشده است؛ همین‌که معلم شروع کند این صفحه باز می‌شود.",
            code="not_running",
            status_code=409,
        )

    visit = GuestAttendance.objects.create(
        session=session,
        full_name=f"{first} {last}"[:80],
        ip=ip or None,
        user_agent=(user_agent or "")[:300],
    )
    try:
        url = client.join_url(
            meeting_id=session.meeting_id,
            full_name=visit.full_name,
            user_id=f"guest-{visit.pk}",
            role="VIEWER",
            password=attendee_password(offering),
        )
    except Exception:
        # Never keep an attendance row for a guest who never got a room link.
        visit.delete()
        raise
    return {"url": url, "session": session, "visit": visit}


def close_session(session):
    if session.ended_at:
        return session
    session.ended_at = timezone.now()
    session.status = Session.Status.ENDED
    session.save(update_fields=["ended_at", "status"])
    return session


def end_session(user, session, client=None):
    """Teacher/admin ends the meeting and closes the local session record."""
    if user.role != "admin" and session.offering.teacher_id != user.pk:
        raise DomainError("دسترسی ندارید.", code="forbidden", status_code=403)
    if session.status == Session.Status.ENDED and session.ended_at:
        return False
    client = client or BBBClient()
    try:
        client.end_meeting(session.meeting_id, moderator_password(session.offering))
    except BBBError as exc:
        raise DomainError("پایان‌دادن کلاس از سمت سرور کلاس انجام نشد.", code="bbb_error", status_code=502) from exc
    close_session(session)
    cache.set(f"bbb:running:{session.offering_id}", False, 5)
    cache.delete("bbb:running:all")
    return True


# ---------------------------------------------------------------------------
# Backwards-compatible helpers used by older callers and the dashboard.


def start_class(user, offering, client=None):
    session = offering.sessions.filter(status=Session.Status.RUNNING).first() or offering.sessions.filter(
        status=Session.Status.PLANNED
    ).order_by("number").first()
    if session is None:
        raise DomainError(
            "اول یک جلسه بسازید؛ کلاس فقط برای همان جلسه ساخته می‌شود.",
            code="no_session",
            status_code=409,
        )
    return start_session(user, session, client=client)


def student_join(user, offering, client=None):
    session = offering.sessions.filter(status=Session.Status.RUNNING).order_by("-number").first()
    if session is None:
        raise DomainError("کلاس هنوز شروع نشده است.", code="not_running", status_code=409)
    return join_session(user, session, client=client)


def end_class(user, offering, client=None):
    closed = 0
    for session in offering.sessions.filter(status=Session.Status.RUNNING):
        if end_session(user, session, client=client):
            closed += 1
    return closed


# ---------------------------------------------------------------------------
# Recordings


def _resolve_session(item):
    """Find the session a BBB recording belongs to."""
    meeting_id = item.get("meeting_id") or ""
    session = Session.objects.select_related("offering").filter(meeting_id=meeting_id).first()
    if session is not None:
        return session
    # Legacy room id: darsjo-<offering id>
    raw = meeting_id.removeprefix("darsjo-")
    offering = Offering.objects.filter(pk=raw).first() if raw.isdigit() else None
    if offering is None:
        return None
    return offering.sessions.order_by("number").first()


def sync_recordings(offering=None, client=None):
    """Pull recordings from BBB and attach each one to its session."""
    client = client or BBBClient()
    records = client.get_recordings()
    touched = 0
    sessions_to_push = {}

    for item in records:
        if not item["published"] or not item["record_id"]:
            continue
        session = _resolve_session(item)
        if session is None:
            continue
        if offering is not None and session.offering_id != offering.pk:
            continue
        target = session.offering
        Recording.objects.update_or_create(
            record_id=item["record_id"],
            defaults={
                "offering": target,
                "session": session,
                "name": item["name"] or session_room_name(target, session),
                "playback_url": item["playback_url"],
                "duration_seconds": item["duration_seconds"],
                "size_bytes": item["size_bytes"],
                "published_at": _bbb_time(item["end_time"])
                or _bbb_time(item["start_time"])
                or timezone.now(),
            },
        )
        sessions_to_push[session.pk] = session
        touched += 1

    for session in sessions_to_push.values():
        try:
            from .portal_sync import push_session_to_portal

            push_session_to_portal(session)
        except Exception:  # pragma: no cover - portal is a best-effort mirror
            logger.warning("portal recording push failed for session %s", session.pk, exc_info=True)
    return touched
