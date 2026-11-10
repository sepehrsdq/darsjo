"""Shared credentials between the LMS and the file panel."""

from unittest.mock import patch

from django.contrib.auth.hashers import check_password, make_password
from django.test import SimpleTestCase, TestCase

from apps.accounts import portal
from apps.accounts.hashers import PortalScryptHasher
from apps.accounts.models import PortalAccount, User

HASH = PortalScryptHasher().encode("Portal@1405", PortalScryptHasher().salt())


class FakeCursor:
    def __init__(self, rows, update_rowcount):
        self._rows = rows
        self._update_rowcount = update_rowcount
        self.rowcount = 0
        self.calls = []

    def execute(self, sql, params=None):
        self.calls.append((" ".join(sql.split()), params))
        if sql.strip().upper().startswith("SELECT"):
            self.rowcount = len(self._rows)
        else:
            self.rowcount = self._update_rowcount

    def fetchall(self):
        return self._rows

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class FakeConnection:
    def __init__(self, rows=(), update_rowcount=1):
        self.rows = list(rows)
        self.update_rowcount = update_rowcount
        self.cursor_obj = None
        self.closed = False

    def cursor(self):
        self.cursor_obj = FakeCursor(self.rows, self.update_rowcount)
        return self.cursor_obj

    def close(self):
        self.closed = True

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


class PortalHasherTests(SimpleTestCase):
    def test_format_matches_the_node_app(self):
        encoded = PortalScryptHasher().encode("Secret@1405", "c2FsdHNhbHRzYWx0c2E=")
        parts = encoded.split("$")
        self.assertEqual(parts[0], "scrypt")
        self.assertEqual(parts[1:4], ["16384", "8", "1"])
        self.assertEqual(len(parts), 6)

    def test_roundtrip_with_django(self):
        hashed = make_password("Teacher@1405")
        self.assertTrue(hashed.startswith("scrypt$"))
        self.assertTrue(check_password("Teacher@1405", hashed))
        self.assertFalse(check_password("wrong", hashed))

    def test_verify_rejects_garbage(self):
        self.assertFalse(PortalScryptHasher().verify("x", "argon2$nope"))
        self.assertFalse(PortalScryptHasher().verify("x", ""))

    def test_must_update_flags_foreign_hashes(self):
        self.assertTrue(PortalScryptHasher().must_update("pbkdf2_sha256$260000$abc$def"))
        self.assertFalse(PortalScryptHasher().must_update(HASH))


class PortalMirrorTests(TestCase):
    def test_students_are_never_pushed(self):
        student = User.objects.create_user(
            username="student1", password="Student@1405", role="student",
            first_name="دانش", last_name="آموز",
        )
        with patch("apps.accounts.portal._connect") as connect:
            self.assertFalse(portal.push_user(student))
            connect.assert_not_called()

    def test_push_writes_the_shared_password_hash(self):
        teacher = User.objects.create_user(
            username="teacher9", password="Teacher@1405", role="teacher",
            first_name="معلم", last_name="نهم",
        )
        connection = FakeConnection(update_rowcount=1)
        with patch("apps.accounts.portal._connect", return_value=connection):
            self.assertTrue(portal.push_user(teacher))

        sql_calls = connection.cursor_obj.calls
        self.assertTrue(any("UPDATE users" in sql for sql, _ in sql_calls))
        hashes = [params[0] for sql, params in sql_calls if "password_hash = %s" in sql]
        self.assertTrue(hashes and hashes[0].startswith("scrypt$"))
        self.assertTrue(PortalAccount.objects.filter(username="teacher9").exists())

    def test_pull_imports_a_teacher_created_in_the_file_panel(self):
        rows = [("teacher7", "مریم احمدی", "teacher", HASH, True, None)]
        connection = FakeConnection(rows=rows)
        with patch("apps.accounts.portal._connect", return_value=connection):
            result = portal.pull_users()

        self.assertEqual(result["created"], 1)
        user = User.objects.get(username="teacher7")
        self.assertEqual(user.role, "teacher")
        self.assertEqual(user.first_name, "مریم")
        self.assertEqual(user.last_name, "احمدی")
        self.assertTrue(user.check_password("Portal@1405"))

    def test_pull_ignores_student_rows(self):
        rows = [("student1", "دانش آموز", "student", HASH, True, None)]
        with patch("apps.accounts.portal._connect", return_value=FakeConnection(rows=rows)):
            result = portal.pull_users()
        self.assertEqual(result["skipped"], 1)
        self.assertFalse(User.objects.filter(username="student1").exists())

    def test_pull_adopts_a_password_changed_in_the_file_panel(self):
        teacher = User.objects.create_user(
            username="teacher8", password="Local@1405", role="teacher",
            first_name="معلم", last_name="هشتم",
        )
        # First sync: the portal is authoritative for the shared password.
        with patch("apps.accounts.portal._connect", return_value=FakeConnection(rows=[
            ("teacher8", "معلم هشتم", "teacher", HASH, True, None)
        ])):
            portal.pull_users()

        teacher.refresh_from_db()
        self.assertTrue(teacher.check_password("Portal@1405"))

        # A later change inside the LMS is kept until it is pushed.
        teacher.set_password("Changed@1405")
        teacher.save()
        with patch("apps.accounts.portal._connect", return_value=FakeConnection(rows=[
            ("teacher8", "معلم هشتم", "teacher", HASH, True, None)
        ])):
            portal.pull_users()
        teacher.refresh_from_db()
        self.assertTrue(teacher.check_password("Changed@1405"))
