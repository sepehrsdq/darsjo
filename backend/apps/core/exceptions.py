from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def api_exception_handler(exc, context):
    """Return a predictable {"error": str, "code": str, "fields": {...}} shape."""
    if isinstance(exc, DomainError):
        return exc.as_response()

    response = exception_handler(exc, context)
    if response is None:
        return None

    detail = response.data
    payload = {"code": "error", "error": "خطای غیرمنتظره‌ای رخ داد."}

    if isinstance(detail, dict) and "detail" in detail:
        payload["error"] = str(detail["detail"])
    elif isinstance(detail, dict):
        first_key = next(iter(detail), None)
        first_value = detail[first_key] if first_key else None
        if isinstance(first_value, (list, tuple)) and first_value:
            first_value = first_value[0]
        payload["error"] = str(first_value or "اطلاعات ارسالی معتبر نیست.")
        payload["fields"] = detail
    elif isinstance(detail, (list, tuple)):
        payload["error"] = str(detail[0]) if detail else payload["error"]

    if response.status_code == status.HTTP_401_UNAUTHORIZED:
        payload["code"] = "unauthorized"
    elif response.status_code == status.HTTP_403_FORBIDDEN:
        payload["code"] = "forbidden"
    elif response.status_code == status.HTTP_404_NOT_FOUND:
        payload["code"] = "not_found"
    elif response.status_code == status.HTTP_429_TOO_MANY_REQUESTS:
        payload["code"] = "throttled"
    elif response.status_code >= 500:
        payload["code"] = "server_error"

    response.data = payload
    return response


class DomainError(Exception):
    """Raised by services for expected, user-facing failures."""

    def __init__(self, message, code="invalid", status_code=status.HTTP_400_BAD_REQUEST):
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code

    def as_response(self):
        return Response({"error": self.message, "code": self.code}, status=self.status_code)
