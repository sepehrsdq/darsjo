"""Audit helpers. Never store national IDs, passwords or tokens in `meta`."""

import logging
from contextvars import ContextVar

from .models import AuditLog

logger = logging.getLogger(__name__)
_current_request = ContextVar("current_request", default=None)


def set_current_request(request):
    _current_request.set(request)


def get_current_request():
    return _current_request.get()


def client_ip(request):
    if request is None:
        return None
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("HTTP_X_REAL_IP") or request.META.get("REMOTE_ADDR")


def request_id(request):
    if request is None:
        return ""
    return getattr(request, "request_id", "") or request.META.get("HTTP_X_REQUEST_ID", "")


def log_action(action, user=None, request=None, target=None, meta=None, level="info"):
    """Record an important action. `meta` must contain no secrets or national IDs."""
    request = request or get_current_request()
    target_type, target_id = "", ""
    if target is not None:
        target_type = target.__class__.__name__
        target_id = str(getattr(target, "pk", "") or "")
    try:
        entry = AuditLog.objects.create(
            user=user if getattr(user, "pk", None) else None,
            username=getattr(user, "username", "") or "",
            action=action,
            target_type=target_type,
            target_id=target_id,
            method=(getattr(request, "method", "") or "")[:8] if request else "",
            path=(getattr(request, "path", "") or "")[:300] if request else "",
            request_id=request_id(request),
            level=level,
            ip=client_ip(request),
            user_agent=(request.META.get("HTTP_USER_AGENT", "")[:300] if request else ""),
            meta=meta or {},
        )
        if request is not None:
            # DRF wraps the Django request; store the id list on the real
            # request object so the response middleware can enrich it.
            target = getattr(request, "_request", None) or request
            ids = getattr(target, "_audit_ids", None)
            if ids is None:
                ids = []
                target._audit_ids = ids
            ids.append(entry.pk)
    except Exception:  # auditing must never break the request
        logger.exception("could not write audit entry %s", action)
