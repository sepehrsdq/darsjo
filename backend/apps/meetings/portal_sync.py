"""Mirror recorded sessions into the file-panel database.

The file panel is a separate system (its own PostgreSQL database and Node app).
Teachers see a read-only «جلسات و ضبط‌ها» page there: session number, title,
date, duration and a watch/download link. Nothing is copied; only metadata.
"""

import hashlib
import hmac
import logging

from django.conf import settings

from apps.accounts.portal import connect
from apps.core.text import to_persian_digits

logger = logging.getLogger(__name__)


def _sign(recording):
    raw = f"rec:{recording.pk}:{recording.record_id}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), raw, hashlib.sha256).hexdigest()[:40]


def download_token(recording):
    return _sign(recording)


def verify_download_token(recording, token):
    return hmac.compare_digest(_sign(recording), token or "")


def download_url(recording):
    base = getattr(settings, "PUBLIC_BASE_URL", "https://kelaas.example.ir").rstrip("/")
    return f"{base}/api/recordings/{recording.pk}/download?token={download_token(recording)}"


def _duration_label(seconds):
    minutes, rest = divmod(int(seconds or 0), 60)
    return to_persian_digits(f"{minutes}:{rest:02d}")


def push_session_to_portal(session):
    """Upsert one recorded session. Never raises (the portal may be offline)."""
    connection = connect()
    if connection is None:
        return False

    recording = (
        session.recordings.filter(is_deleted=False)
        .order_by("-published_at", "-created_at")
        .first()
    )
    try:
        with connection, connection.cursor() as cur:
            if recording is None:
                cur.execute("DELETE FROM lms_sessions WHERE lms_session_id = %s", (session.pk,))
                return True
            offering = session.offering
            teacher = offering.teacher
            cur.execute(
                """
                INSERT INTO lms_sessions (
                    lms_session_id, teacher_username, teacher_name,
                    offering_title, class_name, session_number, session_title,
                    session_date, status, recording_name, playback_url, download_url,
                    duration_label, recorded_at, updated_at
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (lms_session_id) DO UPDATE SET
                    teacher_username = EXCLUDED.teacher_username,
                    teacher_name = EXCLUDED.teacher_name,
                    offering_title = EXCLUDED.offering_title,
                    class_name = EXCLUDED.class_name,
                    session_number = EXCLUDED.session_number,
                    session_title = EXCLUDED.session_title,
                    session_date = EXCLUDED.session_date,
                    status = EXCLUDED.status,
                    recording_name = EXCLUDED.recording_name,
                    playback_url = EXCLUDED.playback_url,
                    download_url = EXCLUDED.download_url,
                    duration_label = EXCLUDED.duration_label,
                    recorded_at = EXCLUDED.recorded_at,
                    updated_at = now()
                """,
                (
                    session.pk,
                    (teacher.username or "").lower(),
                    teacher.full_name or teacher.username,
                    offering.subject.title,
                    offering.class_room.name,
                    session.number,
                    session.title,
                    session.session_date,
                    session.status,
                    recording.name,
                    recording.playback_url,
                    download_url(recording),
                    _duration_label(recording.duration_seconds),
                    recording.published_at,
                ),
            )
        return True
    except Exception as exc:  # pragma: no cover - depends on the deployment
        logger.warning("portal session push failed for %s: %s", session.pk, exc)
        return False
    finally:
        try:
            connection.close()
        except Exception:
            pass


def prune_portal_sessions():
    """Remove mirror rows whose session no longer exists or has no recording."""
    connection = connect()
    if connection is None:
        return 0

    from .models import Session

    valid = set(
        Session.objects.filter(recordings__is_deleted=False).distinct().values_list("pk", flat=True)
    )
    removed = 0
    try:
        with connection, connection.cursor() as cur:
            cur.execute("SELECT lms_session_id FROM lms_sessions")
            existing = {row[0] for row in cur.fetchall()}
            for session_id in existing - valid:
                cur.execute("DELETE FROM lms_sessions WHERE lms_session_id = %s", (session_id,))
                removed += 1
    except Exception as exc:  # pragma: no cover
        logger.warning("portal session prune failed: %s", exc)
    finally:
        try:
            connection.close()
        except Exception:
            pass
    return removed
