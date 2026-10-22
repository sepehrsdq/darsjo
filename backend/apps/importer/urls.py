from django.urls import path

from . import views

urlpatterns = [
    path("import/students/preview", views.preview_import, name="import-preview"),
    path("import/students/commit", views.commit_import, name="import-commit"),
    path("import/students/template", views.download_template, name="import-template"),
]
