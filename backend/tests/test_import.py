import io

from django.test import TestCase
from openpyxl import Workbook

from apps.academic.models import Enrollment
from apps.accounts.models import User
from apps.importer.excel import build_template_workbook, parse_students_workbook
from apps.importer.services import apply_plan, inspect_rows

from .helpers import YEAR, make_classroom, make_national_id


def workbook_bytes(rows, headers=("نام", "نام خانوادگی", "نام کاربری", "کد ملی", "کلاس")):
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(list(headers))
    for row in rows:
        sheet.append(list(row))
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


class ExcelParsingTests(TestCase):
    def test_template_has_required_headers(self):
        raw = build_template_workbook()
        rows, problems = parse_students_workbook(raw)
        self.assertEqual(problems, [])
        self.assertTrue(rows)

    def test_persian_digits_and_padding(self):
        nid = make_national_id(11112222)
        persian = nid.translate(str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹"))
        raw = workbook_bytes([["علی", "رضایی", "ali.r", persian, "سوم الف"]])
        rows, _ = parse_students_workbook(raw)
        self.assertEqual(rows[0][1]["national_id"], nid)

    def test_headers_are_matched_in_english(self):
        nid = make_national_id(22223333)
        raw = workbook_bytes(
            [["Ali", "Rezaei", "ali.r", nid, "سوم الف"]],
            headers=("first_name", "last_name", "username", "national_id", "class"),
        )
        rows, problems = parse_students_workbook(raw)
        self.assertEqual(problems, [])
        self.assertEqual(len(rows), 1)

    def test_missing_columns_are_reported(self):
        raw = workbook_bytes([["علی"]], headers=("نام",))
        rows, problems = parse_students_workbook(raw)
        self.assertEqual(rows, [])
        self.assertTrue(problems)


class ImportPlanTests(TestCase):
    def setUp(self):
        self.classroom = make_classroom("سوم الف")
        self.other_class = make_classroom("چهارم ب", grade=4)

    def test_dry_run_never_writes(self):
        nid = make_national_id(33334444)
        raw = workbook_bytes([["زهرا", "محمدی", "zahra.m", nid, "سوم الف"]])
        rows, _ = parse_students_workbook(raw)
        plan, summary = inspect_rows(rows, YEAR)
        self.assertEqual(summary["create"], 1)
        self.assertEqual(User.objects.count(), 0)
        self.assertEqual(summary["error"], 0)

    def test_unknown_class_is_rejected(self):
        nid = make_national_id(44445555)
        raw = workbook_bytes([["زهرا", "محمدی", "zahra.m", nid, "کلاس ناموجود"]])
        rows, _ = parse_students_workbook(raw)
        plan, summary = inspect_rows(rows, YEAR)
        self.assertEqual(summary["error"], 1)
        self.assertIn("وجود ندارد", plan[0]["errors"][0])

    def test_duplicate_national_id_inside_file(self):
        nid = make_national_id(55556666)
        raw = workbook_bytes(
            [
                ["زهرا", "محمدی", "zahra.m", nid, "سوم الف"],
                ["زهرا", "احمدی", "zahra.a", nid, "چهارم ب"],
            ]
        )
        rows, _ = parse_students_workbook(raw)
        _, summary = inspect_rows(rows, YEAR)
        self.assertEqual(summary["error"], 1)

    def test_apply_is_idempotent(self):
        nid = make_national_id(66667777)
        raw = workbook_bytes([["زهرا", "محمدی", "zahra.m", nid, "سوم الف"]])
        rows, _ = parse_students_workbook(raw)

        plan, _ = inspect_rows(rows, YEAR)
        apply_plan(plan, YEAR)
        self.assertEqual(User.objects.filter(role="student").count(), 1)

        plan2, summary2 = inspect_rows(rows, YEAR)
        self.assertEqual(summary2["update"], 1)
        apply_plan(plan2, YEAR)
        self.assertEqual(User.objects.filter(role="student").count(), 1)
        self.assertEqual(Enrollment.objects.count(), 1)

    def test_moving_class_updates_enrollment(self):
        nid = make_national_id(77778888)
        raw = workbook_bytes([["سارا", "کریمی", "sara.k", nid, "سوم الف"]])
        rows, _ = parse_students_workbook(raw)
        apply_plan(inspect_rows(rows, YEAR)[0], YEAR)

        raw2 = workbook_bytes([["سارا", "کریمی", "sara.k", nid, "چهارم ب"]])
        rows2, _ = parse_students_workbook(raw2)
        apply_plan(inspect_rows(rows2, YEAR)[0], YEAR)

        enrollment = Enrollment.objects.get(year=YEAR)
        self.assertEqual(enrollment.class_room, self.other_class)

    def test_student_gets_initial_password_and_must_change(self):
        nid = make_national_id(88889999)
        raw = workbook_bytes([["مریم", "نوری", "maryam.n", nid, "سوم الف"]])
        rows, _ = parse_students_workbook(raw)
        apply_plan(inspect_rows(rows, YEAR)[0], YEAR)
        student = User.objects.get(national_id=nid)
        self.assertTrue(student.must_change_password)
        self.assertTrue(student.check_password(nid))
