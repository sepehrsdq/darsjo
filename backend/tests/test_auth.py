from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts import captcha
from apps.accounts.models import LoginAttempt
from apps.accounts.throttle import throttle_key

from .helpers import make_admin, make_student, make_teacher


@override_settings(CAPTCHA_ENABLED=False)
class AuthFlowTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.student = make_student("student1", must_change=True)
        self.teacher = make_teacher("teacher1")
        self.admin = make_admin("admin1")

    def login(self, username, password):
        return self.client.post(
            "/api/auth/login", {"username": username, "password": password}, format="json"
        )

    def test_login_success_sets_cookie(self):
        response = self.login("teacher1", "Teacher@1405")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["user"]["role"], "teacher")
        self.assertIn("darsjo_session", response.cookies)

    def test_login_failure_is_generic(self):
        response = self.login("teacher1", "wrong-password")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["code"], "invalid_credentials")
        self.assertNotIn("Teacher", response.data["error"])

    def test_login_locks_after_repeated_failures(self):
        for _ in range(5):
            self.login("teacher1", "nope")
        response = self.login("teacher1", "Teacher@1405")
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.data["code"], "locked")

    def test_successful_login_clears_failures(self):
        self.login("teacher1", "nope")
        self.login("teacher1", "Teacher@1405")
        key = throttle_key("teacher1", "127.0.0.1")
        self.assertFalse(LoginAttempt.objects.filter(key=key).exists())

    def test_must_change_password_blocks_other_endpoints(self):
        self.login(self.student.username, self.student.national_id)
        blocked = self.client.get("/api/offerings")
        self.assertEqual(blocked.status_code, 403)
        self.assertEqual(blocked.json()["code"], "password_change_required")

        allowed = self.client.get("/api/auth/me")
        self.assertEqual(allowed.status_code, 200)
        self.assertTrue(allowed.data["mustChangePassword"])

    def test_new_password_cannot_equal_national_id(self):
        self.login(self.student.username, self.student.national_id)
        response = self.client.post(
            "/api/auth/change-password",
            {
                "current_password": self.student.national_id,
                "new_password": self.student.national_id,
                "confirm_password": self.student.national_id,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_password", response.data.get("fields", {}))

    def test_new_password_minimum_length(self):
        self.login(self.student.username, self.student.national_id)
        response = self.client.post(
            "/api/auth/change-password",
            {"current_password": self.student.national_id, "new_password": "short", "confirm_password": "short"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_change_password_unlocks_the_app(self):
        self.login(self.student.username, self.student.national_id)
        response = self.client.post(
            "/api/auth/change-password",
            {
                "current_password": self.student.national_id,
                "new_password": "NewPass@1405",
                "confirm_password": "NewPass@1405",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["mustChangePassword"])
        self.assertEqual(self.client.get("/api/offerings").status_code, 200)
        self.student.refresh_from_db()
        self.assertTrue(self.student.check_password("NewPass@1405"))

    def test_logout_clears_session(self):
        self.login("teacher1", "Teacher@1405")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 200)
        self.client.post("/api/auth/logout")
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)

    def test_anonymous_cannot_read_api(self):
        self.assertEqual(self.client.get("/api/auth/me").status_code, 401)
        self.assertEqual(self.client.get("/api/offerings").status_code, 401)


@override_settings(CAPTCHA_ENABLED=True)
class CaptchaTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        cache.clear()
        self.teacher = make_teacher("teacher1")

    def test_challenge_is_one_time_and_accepts_the_target(self):
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        ok, reason, _left = captcha.verify(payload["token"], record["x"])
        self.assertTrue(ok, reason)
        again, reason, _left = captcha.verify(payload["token"], record["x"])
        self.assertFalse(again)
        self.assertEqual(reason, "expired")

    def test_wrong_position_burns_the_challenge(self):
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        ok, reason, _left = captcha.verify(payload["token"], record["x"] + 60)
        self.assertFalse(ok)
        self.assertEqual(reason, "wrong")
        # exactly one chance: the same puzzle cannot be retried
        again, reason, _left = captcha.verify(payload["token"], record["x"])
        self.assertFalse(again)
        self.assertEqual(reason, "expired")

    def test_live_check_keeps_a_correct_puzzle_for_login(self):
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        ok, reason = captcha.check(payload["token"], record["x"])
        self.assertTrue(ok, reason)
        # the login request still consumes the same token
        ok, reason, _left = captcha.verify(payload["token"], record["x"])
        self.assertTrue(ok, reason)

    def test_live_check_rejects_wrong_and_burns_the_puzzle(self):
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        ok, reason = captcha.check(payload["token"], record["x"] + 60)
        self.assertFalse(ok)
        self.assertEqual(reason, "wrong")
        again, reason = captcha.check(payload["token"], record["x"])
        self.assertFalse(again)
        self.assertEqual(reason, "expired")

    def test_captcha_verify_endpoint(self):
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        response = self.client.post(
            "/api/auth/captcha/verify",
            {"captcha_token": payload["token"], "captcha_x": record["x"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["ok"])

    def test_inactive_user_gets_a_clear_message(self):
        self.teacher.is_active = False
        self.teacher.save(update_fields=["is_active"])
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        response = self.client.post(
            "/api/auth/login",
            {
                "username": "teacher1",
                "password": "Teacher@1405",
                "captcha_token": payload["token"],
                "captcha_x": record["x"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["code"], "inactive")
        self.assertIn("غیرفعال", response.data["error"])

    def test_login_needs_a_solved_captcha(self):
        response = self.client.post(
            "/api/auth/login", {"username": "teacher1", "password": "Teacher@1405"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["code"], "captcha")

    def test_login_with_solved_captcha_succeeds(self):
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        response = self.client.post(
            "/api/auth/login",
            {
                "username": "teacher1",
                "password": "Teacher@1405",
                "captcha_token": payload["token"],
                "captcha_x": record["x"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

    def test_student_national_id_without_leading_zero_is_accepted(self):
        student = make_student("student-zero", national_id="0451234567", must_change=False)
        self.assertEqual(student.national_id, "0451234567")
        payload = captcha.create_challenge("127.0.0.1")
        record = cache.get(f"captcha:{payload['token']}")
        response = self.client.post(
            "/api/auth/login",
            {
                "username": "student-zero",
                "password": "451234567",
                "captcha_token": payload["token"],
                "captcha_x": record["x"],
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
