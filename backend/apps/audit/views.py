from datetime import timedelta

from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_date
from rest_framework.decorators import api_view, permission_classes
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response

from apps.core.permissions import IsAdmin

from .models import AuditLog


class AuditPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = "pageSize"
    max_page_size = 200


def _filtered(request):
    qs = AuditLog.objects.all()
    params = request.query_params

    action = params.get("action")
    if action == "failures":
        qs = qs.filter(level__in=["warning", "error"])
    elif action:
        qs = qs.filter(action__startswith=action)

    username = params.get("username")
    if username:
        qs = qs.filter(username__icontains=username)

    path = params.get("path")
    if path:
        qs = qs.filter(path__icontains=path)

    request_id = params.get("request_id") or params.get("requestId")
    if request_id:
        qs = qs.filter(request_id__icontains=request_id)

    level = params.get("level")
    if level in {"info", "warning", "error"}:
        qs = qs.filter(level=level)

    status = params.get("status")
    if status == "4xx":
        qs = qs.filter(status_code__gte=400, status_code__lt=500)
    elif status == "5xx":
        qs = qs.filter(status_code__gte=500)
    elif status == "2xx":
        qs = qs.filter(status_code__gte=200, status_code__lt=300)
    elif status and status.isdigit():
        qs = qs.filter(status_code=int(status))

    query = params.get("q")
    if query:
        qs = qs.filter(
            Q(username__icontains=query)
            | Q(path__icontains=query)
            | Q(action__icontains=query)
            | Q(request_id__icontains=query)
        )

    days = params.get("days")
    if days and days.isdigit():
        qs = qs.filter(created_at__gte=timezone.now() - timedelta(days=int(days)))

    since = parse_date(params.get("since", ""))
    if since:
        qs = qs.filter(created_at__date__gte=since)
    until = parse_date(params.get("until", ""))
    if until:
        qs = qs.filter(created_at__date__lte=until)

    return qs


@api_view(["GET"])
@permission_classes([IsAdmin])
def audit_list(request):
    qs = _filtered(request).order_by("-created_at", "-id")

    paginator = AuditPagination()
    page = paginator.paginate_queryset(qs, request)
    items = [
        {
            "id": item.pk,
            "action": item.action,
            "username": item.username,
            "targetType": item.target_type,
            "targetId": item.target_id,
            "method": item.method,
            "path": item.path,
            "statusCode": item.status_code,
            "durationMs": item.duration_ms,
            "requestId": item.request_id,
            "level": item.level,
            "ip": item.ip,
            "userAgent": item.user_agent,
            "meta": item.meta,
            "createdAt": item.created_at,
        }
        for item in page
    ]
    response = paginator.get_paginated_response(items)

    today = timezone.localdate()
    summary = {
        "total": qs.count(),
        "errors": qs.filter(level="error").count(),
        "warnings": qs.filter(level="warning").count(),
        "today": qs.filter(created_at__date=today).count(),
        "byAction": list(
            qs.values("action").annotate(count=Count("id")).order_by("-count", "action")[:10]
        ),
    }
    response.data["summary"] = summary
    return response


@api_view(["GET"])
@permission_classes([IsAdmin])
def audit_detail(request, pk):
    item = AuditLog.objects.filter(pk=pk).first()
    if not item:
        return Response({"error": "رویداد پیدا نشد.", "code": "not_found"}, status=404)
    return Response(
        {
            "id": item.pk,
            "action": item.action,
            "username": item.username,
            "targetType": item.target_type,
            "targetId": item.target_id,
            "method": item.method,
            "path": item.path,
            "statusCode": item.status_code,
            "durationMs": item.duration_ms,
            "requestId": item.request_id,
            "level": item.level,
            "ip": item.ip,
            "userAgent": item.user_agent,
            "meta": item.meta,
            "createdAt": item.created_at,
        }
    )
