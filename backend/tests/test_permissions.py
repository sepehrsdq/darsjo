from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.academic.models import Enrollment, Offering
from apps.meetings.models import Recording

from .helpers import YEAR, enroll, make_admin, make_classroom, make_offering, make_student, make_teacher


class RolePermissionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = make_admin("admin1")
        self.teacher = make_teacher("teacher1")
        self.other_teacher = make_teacher("teacher2")
        self.classroom = make_classroom("سوم الف")
        self.other_class = make_classroom("چهارم ب", grade=4)
        self.offering = make_offering(self.classroom, self.teacher, "ریاضی")
        self.other_offering = make_offering(self.other_class, self.other_teacher, "علوم")
        self.student = make_student("student1", must_change=False)
        enroll(self.student, self.classroom)
        self.outsider = make_student("student2", national_id=None, must_change=False)
        enroll(self.outsider, self.other_class)

    def test_admin_endpoints_are_admin_only(self):
        for user in (self.teacher, self.student):
            self.client.force_login(user)
            self.assertEqual(self.client.get("/api/admin/users").status_code, 403)
            self.assertEqual(self.client.get("/api/admin/stats").status_code, 403)
            self.assertEqual(self.client.get("/api/admin/audit").status_code, 403)

        self.client.force_login(self.admin)
        self.assertEqual(self.client.get("/api/admin/users").status_code, 200)
        self.assertEqual(self.client.get("/api/admin/stats").status_code, 200)

    def test_teacher_sees_only_own_offerings(self):
        self.client.force_login(self.teacher)
        response = self.client.get("/api/offerings")
        self.assertEqual(response.status_code, 200)
        ids = [item["id"] for item in response.data]
        self.assertIn(self.offering.pk, ids)
        self.assertNotIn(self.other_offering.pk, ids)
        self.assertEqual(self.client.get(f"/api/offerings/{self.other_offering.pk}").status_code, 404)

    def test_student_sees_only_class_offerings(self):
        self.client.force_login(self.student)
        response = self.client.get("/api/offerings")
        self.assertEqual([item["id"] for item in response.data], [self.offering.pk])
        self.assertEqual(self.client.get(f"/api/offerings/{self.other_offering.pk}").status_code, 404)

    def test_removing_enrollment_revokes_access(self):
        self.client.force_login(self.student)
        self.assertEqual(len(self.client.get("/api/offerings").data), 1)
        enrollment = Enrollment.objects.get(student=self.student)
        enrollment.is_active = False
        enrollment.save(update_fields=["is_active"])
        self.assertEqual(self.client.get("/api/offerings").data, [])

    def test_student_cannot_manage_classes(self):
        self.client.force_login(self.student)
        self.assertEqual(
            self.client.post("/api/classes", {"name": "هک", "grade": 1, "year": YEAR}, format="json").status_code,
            403,
        )

    def test_teacher_cannot_create_class(self):
        self.client.force_login(self.teacher)
        self.assertEqual(
            self.client.post("/api/classes", {"name": "کلاس جدید", "grade": 1, "year": YEAR}, format="json").status_code,
            403,
        )

    def test_admin_can_create_class(self):
        self.client.force_login(self.admin)
        response = self.client.post(
            "/api/classes", {"name": "پنجم الف", "grade": 5, "year": YEAR}, format="json"
        )
        self.assertEqual(response.status_code, 201)

    def test_student_cannot_read_other_recordings(self):
        recording = Recording.objects.create(
            record_id="r-1", offering=self.other_offering, name="ضبط", playback_url="https://bbb.test/p"
        )
        self.client.force_login(self.student)
        response = self.client.get(f"/api/offerings/{self.other_offering.pk}/recordings")
        self.assertEqual(response.status_code, 404)
        own = self.client.get(f"/api/offerings/{self.offering.pk}/recordings")
        self.assertEqual(own.status_code, 200)
        self.assertEqual(own.data, [])

    def test_teacher_cannot_see_admin_user_list(self):
        self.client.force_login(self.teacher)
        self.assertEqual(self.client.get("/api/admin/users").status_code, 403)

    def test_student_cannot_start_class(self):
        self.client.force_login(self.student)
        response = self.client.post(f"/api/offerings/{self.offering.pk}/start")
        self.assertEqual(response.status_code, 403)
