"""Excel parsing for student imports (normalization lives in apps.core.text)."""

import io
import re

from openpyxl import Workbook, load_workbook

from apps.core.text import clean_national_id, clean_text

HEADER_ALIASES = {
    "first_name": {"نام", "first_name", "firstname", "name"},
    "last_name": {"نام خانوادگی", "نام‌خانوادگی", "نامخانوادگی", "last_name", "lastname", "surname"},
    "username": {"نام کاربری", "نام‌کاربری", "نامکاربری", "username", "user"},
    "national_id": {"کد ملی", "کدملی", "کد‌ملی", "national_id", "nationalid", "national code", "melli"},
    "class_name": {"کلاس", "class", "class_name", "کلاس درس"},
}

USERNAME_RE = re.compile(r"^[a-z0-9._-]{3,32}$")


def _normalize_header(value):
    return clean_text(value).lower().replace("_", " ").strip()


def _header_map(sheet):
    first = [cell.value for cell in next(sheet.iter_rows(min_row=1, max_row=1))]
    mapping = {}
    for index, raw in enumerate(first):
        normalized = _normalize_header(raw)
        for field, aliases in HEADER_ALIASES.items():
            if normalized in {_normalize_header(alias) for alias in aliases}:
                mapping[field] = index
                break
    return mapping


def parse_students_workbook(raw_bytes):
    """Return [(row_number, {field: value})] plus a list of fatal problems."""
    try:
        workbook = load_workbook(io.BytesIO(raw_bytes), data_only=True, read_only=True)
    except Exception:
        return [], ["فایل اکسل قابل خواندن نیست. یک فایل xlsx معتبر انتخاب کنید."]

    sheet = workbook.active
    mapping = _header_map(sheet)
    required = {"first_name", "last_name", "username", "national_id", "class_name"}
    missing = required - set(mapping)
    if missing:
        labels = {
            "first_name": "نام",
            "last_name": "نام خانوادگی",
            "username": "نام کاربری",
            "national_id": "کد ملی",
            "class_name": "کلاس",
        }
        return [], ["ستون‌های ضروری پیدا نشد: " + "، ".join(labels[item] for item in sorted(missing))]

    rows = []
    for row_number, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
        if row is None or all(value in (None, "") for value in row):
            continue
        record = {}
        for field, index in mapping.items():
            value = row[index] if index < len(row) else None
            if field == "national_id":
                record[field] = clean_national_id(value)
            elif field == "username":
                record[field] = clean_text(value).replace(" ", "").lower()
            else:
                record[field] = clean_text(value)
        rows.append((row_number, record))
    return rows, []


def build_template_workbook():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "دانش‌آموزان"
    sheet.sheet_view.rightToLeft = True
    headers = ["نام", "نام خانوادگی", "نام کاربری", "کد ملی", "کلاس"]
    sheet.append(headers)
    sheet.append(["علی", "رضایی", "ali.rezaei", "0012345678", "سوم الف"])
    sheet.append(["زهرا", "محمدی", "zahra.m", "0023456789", "سوم الف"])
    widths = [16, 20, 20, 16, 18]
    for index, width in enumerate(widths, start=1):
        sheet.column_dimensions[chr(64 + index)].width = width
    buffer = io.BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()
