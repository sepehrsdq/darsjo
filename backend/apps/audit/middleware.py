"""Attach a request id, measure every API call and enrich explicit audit rows."""

import logging
import time
import uuid

from .models import AuditLog
from .services import log_action, set_current_request

logger = logging.getLogger(__name__)

SKIP_PREFIXES = ("/static/", "/media/", "/health", "/api/health", "/favicon", "/_next/")


def _skipped(path):
    return not path or path.startswith(SKIP_PREFIXES)


class RequestContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        request.request_id = (request.headers.get("X-Request-ID") or uuid.uuid4().hex)[:32]
        request.started_at = time.monotonic()
        set_current_request(request)

        try:
            response = self.get_response(request)
        except Exception as exc:
            self._finish(request, 500, exc)
            raise

        self._finish(request, response.status_code)
        response["X-Request-ID"] = request.request_id
        return response

    def _finish(self, request, status_code, exc=None):
        if _skipped(getattr(request, "path", "")):
            return
        duration = int((time.monotonic() - getattr(request, "started_at", time.monotonic())) * 1000)
        level = "error" if status_code >= 500 else "warning" if status_code >= 400 else "info"
        ids = getattr(request, "_audit_ids", [])

        if ids:
            try:
                AuditLog.objects.filter(pk__in=ids).update(
                    method=(request.method or "")[:8],
                    path=(request.path or "")[:300],
                    status_code=status_code,
                    duration_ms=max(duration, 0),
                    level=level,
                )
            except Exception:
                logger.exception("could not enrich audit rows")
            return

        # Do not flood the log with successful reads. Failures and every
        # mutation that did not record a domain-specific action are kept.
        mutation = request.method not in {"GET", "HEAD", "OPTIONS"}
        if status_code < 400 and not mutation:
            return

        meta = {}
        if exc is not None:
            meta = {"exception": exc.__class__.__name__, "message": str(exc)[:400]}
        user = getattr(request, "user", None)
        if not getattr(user, "is_authenticated", False):
            user = None
        log_action(
            "http.error" if status_code >= 400 else "http.request",
            user=user,
            request=request,
            meta=meta,
            level=level,
        )
        # log_action appended a new id; stamp the response details on it.
        new_ids = getattr(request, "_audit_ids", [])
        if new_ids:
            try:
                AuditLog.objects.filter(pk__in=new_ids).update(
                    method=(request.method or "")[:8],
                    path=(request.path or "")[:300],
                    status_code=status_code,
                    duration_ms=max(duration, 0),
                    level=level,
                )
            except Exception:
                logger.exception("could not finish audit row")
