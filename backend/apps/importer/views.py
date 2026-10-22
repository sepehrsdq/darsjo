from django.conf import settings
from django.http import HttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes, permission_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audit.services import log_action
from apps.core.exceptions import DomainError
from apps.core.permissions import IsAdmin

from .excel import build_template_workbook, parse_students_workbook
from .services import apply_plan, inspect_rows


def _read_upload(request):
    upload = request.FILES.get("file")
    if not upload:
        raise DomainError("فایلی انتخاب نشده است.", code="no_file")
    if upload.size > settings.MAX_IMPORT_BYTES:
        raise DomainError("حجم فایل بیش از حد مجاز است.", code="too_large")
    if not upload.name.lower().endswith((".xlsx", ".xlsm")):
        raise DomainError("فقط فایل Excel با پسوند xlsx پذیرفته می‌شود.", code="bad_extension")
    return upload.read()


def _year(request):
    return (request.data.get("year") or request.query_params.get("year") or settings.DEFAULT_ACADEMIC_YEAR).strip()


def _public_plan(plan):
    cleaned = []
    for item in plan:
        cleaned.append({key: value for key, value in item.items() if not key.startswith("_")})
    return cleaned


@api_view(["POST"])
@permission_classes([IsAdmin])
@parser_classes([MultiPartParser, FormParser])
def preview_import(request):
    raw = _read_upload(request)
    rows, problems = parse_students_workbook(raw)
    if problems:
        raise DomainError(" ".join(problems), code="bad_file")
    plan, summary = inspect_rows(rows, _year(request))
    return Response({"rows": _public_plan(plan), "summary": summary, "year": _year(request)})


@api_view(["POST"])
@permission_classes([IsAdmin])
@parser_classes([MultiPartParser, FormParser])
def commit_import(request):
    raw = _read_upload(request)
    rows, problems = parse_students_workbook(raw)
    if problems:
        raise DomainError(" ".join(problems), code="bad_file")
    year = _year(request)
    plan, summary = inspect_rows(rows, year)
    if summary["error"]:
        return Response(
            {"error": "فایل خطا دارد؛ ابتدا پیش‌نمایش را اصلاح کنید.", "code": "has_errors", "summary": summary},
            status=status.HTTP_400_BAD_REQUEST,
        )
    result = apply_plan(plan, year)
    log_action("import.students", user=request.user, request=request, meta={"year": year, **result})
    return Response({"summary": summary, "applied": result})


@api_view(["GET"])
@permission_classes([IsAdmin])
def download_template(_request):
    payload = build_template_workbook()
    response = HttpResponse(
        payload,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    response["Content-Disposition"] = 'attachment; filename="darsjo-students-template.xlsx"'
    return response
