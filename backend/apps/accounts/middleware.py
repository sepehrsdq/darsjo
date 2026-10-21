from django.conf import settings
from django.http import JsonResponse

ALLOWED_PREFIXES = (
    "/api/auth/me",
    "/api/auth/logout",
    "/api/auth/change-password",
    "/api/auth/csrf",
    "/health",
    "/static/",
    "/media/",
    "/admin/",
)


class MustChangePasswordMiddleware:
    """A student who still uses the initial password may only change it."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if (
            user is not None
            and user.is_authenticated
            and getattr(user, "must_change_password", False)
            and request.path.startswith("/api/")
            and not request.path.startswith(ALLOWED_PREFIXES)
        ):
            return JsonResponse(
                {
                    "error": "برای ادامه، ابتدا رمز عبور خود را تغییر دهید.",
                    "code": "password_change_required",
                },
                status=403,
            )
        return self.get_response(request)
