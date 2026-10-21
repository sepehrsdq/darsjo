from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path


def health(_request):
    return JsonResponse({"ok": True, "service": "darsjo-api", "version": "1.0.0"})


urlpatterns = [
    path("health/", health, name="health"),
    path("api/health/", health, name="api-health"),
    path("admin/", admin.site.urls),
    path("api/auth/", include("apps.accounts.auth_urls")),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.academic.urls")),
    path("api/", include("apps.meetings.urls")),
    path("api/", include("apps.importer.urls")),
    path("api/", include("apps.audit.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
