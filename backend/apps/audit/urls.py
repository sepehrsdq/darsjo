from django.urls import path

from . import views

urlpatterns = [
    path("admin/audit", views.audit_list, name="audit-list"),
    path("admin/audit/<int:pk>", views.audit_detail, name="audit-detail"),
]
