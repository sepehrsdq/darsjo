from datetime import timedelta

from django.core.management import call_command
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog

from .helpers import make_admin, make_teacher


@override_settings(CAPTCHA_ENABLED=False)
class AuditMiddlewareTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin("admin-audit")
        self.teacher = make_teacher("teacher-audit")

    def test_failed_request_gets_a_request_id_and_a_row(self):
        self.client.force_login(self.admin)
        response = self.client.get("/api/offerings/999999")
        self.assertEqual(response.status_code, 404)
        request_id = response["X-Request-ID"]
        self.assertTrue(request_id)
        row = AuditLog.objects.filter(request_id=request_id).first()
        self.assertIsNotNone(row)
        self.assertEqual(row.status_code, 404)
        self.assertEqual(row.level, "warning")
        self.assertEqual(row.path, "/api/offerings/999999")
        self.assertIsNotNone(row.duration_ms)

    def test_login_failure_is_enriched_with_status_and_duration(self):
        response = self.client.post(
            "/api/auth/login",
            {"username": "teacher-audit", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
        row = AuditLog.objects.filter(action="auth.login_failed").order_by("-id").first()
        self.assertIsNotNone(row)
        self.assertEqual(row.status_code, 401)
        self.assertIsNotNone(row.duration_ms)
        self.assertEqual(row.method, "POST")
        self.assertEqual(row.username, "")

    def test_only_admin_can_read_the_audit(self):
        self.client.force_login(self.teacher)
        self.assertEqual(self.client.get("/api/admin/audit").status_code, 403)
        self.client.force_login(self.admin)
        response = self.client.get("/api/admin/audit")
        self.assertEqual(response.status_code, 200)
        self.assertIn("summary", response.data)


class AuditRetentionTests(TestCase):
    def test_prune_audit_removes_only_rows_older_than_the_window(self):
        old = AuditLog.objects.create(action="auth.login", username="old")
        recent = AuditLog.objects.create(action="auth.login", username="recent")
        AuditLog.objects.filter(pk=old.pk).update(
            created_at=timezone.now() - timedelta(days=8)
        )
        call_command("prune_audit", days=7, verbosity=0)
        self.assertFalse(AuditLog.objects.filter(pk=old.pk).exists())
        self.assertTrue(AuditLog.objects.filter(pk=recent.pk).exists())
