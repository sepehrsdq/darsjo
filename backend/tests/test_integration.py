"""End-to-end: import ← login ← change password ← start class ← student join."""

import io
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from openpyxl import Workbook
from rest_framework.test import APIClient

from apps.academic.models import Enrollment, Offering
from apps.accounts.models import User
from apps.meetings.models import Recording, Session

from .helpers import YEAR, FakeBBB, make_admin, make_classroom, make_offering, make_national_id, make_teacher


def students_workbook(rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["نام", "نام خانوادگی", "نام کاربری", "کد ملی", "کلاس"])
    for row in rows:
        sheet.append(list(row))
    buffer = io.BytesIO()
    workbook.save(buffer)
    buffer.seek(0)
    buffer.name = "students.xlsx"
    return buffer


@override_settings(CAPTCHA_ENABLED=False)
class FullFlowIntegrationTest(TestCase):
    def setUp(self):
        cache.clear()
        self.bbb = FakeBBB()
        patcher = patch("apps.meetings.services.BBBClient", return_value=self.bbb)
        self.addCleanup(patcher.stop)
        patcher.start()

        self.admin = make_admin("admin1")
        self.teacher = make_teacher("teacher1")
        self.classroom = make_classroom("سوم الف")
        self.offering = make_offering(self.classroom, self.teacher, "ریاضی")
        self.national_id = make_national_id(12345678)
        self.admin_client = APIClient()

    def test_full_school_day(self):
        # 1) admin logs in
        response = self.admin_client.post(
            "/api/auth/login", {"username": "admin1", "password": "Admin@1405pass"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        # 2) dry-run import
        workbook = students_workbook([["علی", "رضایی", "ali.r", self.national_id, "سوم الف"]])
        preview = self.admin_client.post("/api/import/students/preview", {"file": workbook}, format="multipart")
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data["summary"]["create"], 1)

        workbook = students_workbook([["علی", "رضایی", "ali.r", self.national_id, "سوم الف"]])
        commit = self.admin_client.post("/api/import/students/commit", {"file": workbook}, format="multipart")
        self.assertEqual(commit.status_code, 200, commit.data)
        self.assertEqual(commit.data["applied"]["created"], 1)

        # 3) student logs in with the national ID
        student_client = APIClient()
        response = student_client.post(
            "/api/auth/login", {"username": "ali.r", "password": self.national_id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["mustChangePassword"])
        self.assertEqual(student_client.get("/api/offerings").status_code, 403)

        # 4) change password
        changed = student_client.post(
            "/api/auth/change-password",
            {
                "current_password": self.national_id,
                "new_password": "Ali@1405school",
                "confirm_password": "Ali@1405school",
            },
            format="json",
        )
        self.assertEqual(changed.status_code, 200)

        # 5) student cannot join before the teacher starts
        early = student_client.post(f"/api/offerings/{self.offering.pk}/join")
        self.assertEqual(early.status_code, 409)

        # 6) teacher creates the numbered session and starts its room
        teacher_client = APIClient()
        teacher_client.post("/api/auth/login", {"username": "teacher1", "password": "Teacher@1405"}, format="json")
        created = teacher_client.post(
            f"/api/offerings/{self.offering.pk}/sessions",
            {"number": 1, "title": "جلسهٔ اول"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        started = teacher_client.post(f"/api/sessions/{created.data['id']}/start")
        self.assertEqual(started.status_code, 200, started.data)
        self.assertIn("role=MODERATOR", started.data["joinUrl"])
        self.assertTrue(
            Session.objects.filter(offering=self.offering, status=Session.Status.RUNNING).exists()
        )

        # 7) student joins with a server-built, user-specific link
        joined = student_client.post(f"/api/offerings/{self.offering.pk}/join")
        self.assertEqual(joined.status_code, 200, joined.data)
        self.assertIn("role=VIEWER", joined.data["joinUrl"])
        self.assertIn(str(User.objects.get(username="ali.r").pk), joined.data["joinUrl"])

        # 8) dashboards reflect the running class
        listing = student_client.get("/api/offerings")
        self.assertTrue(listing.data[0]["isRunning"])

        # 9) admin sees the active session in stats
        stats = self.admin_client.get("/api/admin/stats")
        self.assertEqual(stats.data["sessions"]["active"], 1)
        self.assertEqual(stats.data["users"]["students"], 1)

        # 10) ending the class closes the session
        teacher_client.post(f"/api/offerings/{self.offering.pk}/end")
        self.assertFalse(
            Session.objects.filter(offering=self.offering, status=Session.Status.RUNNING).exists()
        )

    def test_teacher_only_sees_own_offerings_in_profile(self):
        other_teacher = make_teacher("teacher2")
        make_offering(make_classroom("چهارم ب", grade=4), other_teacher, "علوم")
        client = APIClient()
        client.post("/api/auth/login", {"username": "teacher1", "password": "Teacher@1405"}, format="json")
        profile = client.get("/api/profile")
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(len(profile.data["offerings"]), 1)
        self.assertEqual(profile.data["ftpUsername"], "teacher1")
