from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.academic.models import ClassRoom, Enrollment, Offering, Subject

from .helpers import YEAR, enroll, make_admin, make_classroom, make_offering, make_student, make_teacher

User = get_user_model()


class AdminManageTests(TestCase):
    """Deleting classes/lessons and disabling accounts."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.admin = make_admin("admin1")
        self.teacher = make_teacher("teacher1")
        self.classroom = make_classroom("سوم الف")
        self.offering = make_offering(self.classroom, self.teacher, "ریاضی")

    def test_create_offering_returns_the_nested_read_shape(self):
        self.client.force_login(self.admin)
        subject = Subject.objects.create(title="علوم")
        response = self.client.post(
            "/api/offerings",
            {
                "class_room": self.classroom.pk,
                "subject": subject.pk,
                "teacher": self.teacher.pk,
                "year": YEAR,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["subject"]["title"], "علوم")
        self.assertEqual(response.data["teacher"]["username"], "teacher1")
        self.assertEqual(response.data["classRoom"]["name"], "سوم الف")

    def test_admin_can_delete_an_offering(self):
        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/offerings/{self.offering.pk}")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(Offering.objects.filter(pk=self.offering.pk).exists())

    def test_teacher_cannot_delete_an_offering(self):
        self.client.force_login(self.teacher)
        self.assertEqual(self.client.delete(f"/api/offerings/{self.offering.pk}").status_code, 403)

    def test_deleting_a_class_cascades_its_offerings(self):
        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/classes/{self.classroom.pk}")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(ClassRoom.objects.filter(pk=self.classroom.pk).exists())
        self.assertFalse(Offering.objects.filter(pk=self.offering.pk).exists())

    def test_subject_in_use_needs_explicit_confirmation(self):
        self.client.force_login(self.admin)
        subject = self.offering.subject
        response = self.client.delete(f"/api/subjects/{subject.pk}")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "in_use")
        forced = self.client.delete(f"/api/subjects/{subject.pk}?force=1")
        self.assertEqual(forced.status_code, 204)
        self.assertFalse(Subject.objects.filter(pk=subject.pk).exists())
        self.assertFalse(Offering.objects.filter(pk=self.offering.pk).exists())

    def test_admin_cannot_deactivate_own_account(self):
        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/admin/users/{self.admin.pk}", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "self_deactivate")
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_admin_can_delete_a_user_and_release_the_username(self):
        free_teacher = make_teacher("teacher-free")
        teacher_client = APIClient()
        teacher_client.force_login(free_teacher)
        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/admin/users/{free_teacher.pk}")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(username="teacher-free").exists())
        self.assertEqual(teacher_client.get("/api/auth/me").status_code, 401)
        # the username can be used again
        again = self.client.post(
            "/api/admin/users",
            {"username": "teacher-free", "first_name": "تازه", "last_name": "آزاد", "role": "teacher"},
            format="json",
        )
        self.assertEqual(again.status_code, 201)

    def test_admin_can_delete_a_student_and_their_enrollments(self):
        student = make_student("student-del")
        student_id = student.pk
        enroll(student, self.classroom)
        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/admin/users/{student_id}")
        self.assertEqual(response.status_code, 204)
        self.assertFalse(User.objects.filter(pk=student_id).exists())
        self.assertFalse(Enrollment.objects.filter(student_id=student_id).exists())

    def test_admin_cannot_delete_a_teacher_with_lessons(self):
        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/admin/users/{self.teacher.pk}")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(response.data["code"], "has_offerings")
        self.assertTrue(User.objects.filter(pk=self.teacher.pk).exists())

    def test_teacher_cannot_delete_users(self):
        self.client.force_login(self.teacher)
        response = self.client.delete(f"/api/admin/users/{self.admin.pk}")
        self.assertEqual(response.status_code, 403)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_admin_cannot_delete_own_account(self):
        self.client.force_login(self.admin)
        response = self.client.delete(f"/api/admin/users/{self.admin.pk}")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "self_delete")

    def test_deactivating_a_user_kills_existing_sessions(self):
        teacher_client = APIClient()
        teacher_client.force_login(self.teacher)
        self.assertEqual(teacher_client.get("/api/auth/me").status_code, 200)

        self.client.force_login(self.admin)
        response = self.client.patch(
            f"/api/admin/users/{self.teacher.pk}", {"is_active": False}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(teacher_client.get("/api/auth/me").status_code, 401)
