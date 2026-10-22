"""Validate and apply student imports. Idempotent: re-importing the same file updates rows."""

from django.db import transaction

from apps.academic.models import ClassRoom, Enrollment
from apps.accounts.models import User
from apps.core.text import national_id_is_valid

from .excel import USERNAME_RE


def inspect_rows(rows, year):
    """Dry-run: never touches the database. Returns per-row plan + summary."""
    classes = {room.name.strip(): room for room in ClassRoom.objects.filter(year=year)}
    nids = [rec.get("national_id") for _, rec in rows if rec.get("national_id")]
    usernames = [rec.get("username") for _, rec in rows if rec.get("username")]
    users_by_nid = {u.national_id: u for u in User.objects.filter(national_id__in=nids)}
    users_by_username = {u.username: u for u in User.objects.filter(username__in=usernames)}

    seen_nid = {}
    seen_username = {}
    plan = []

    for row_number, rec in rows:
        errors = []
        first_name = rec.get("first_name", "")
        last_name = rec.get("last_name", "")
        username = rec.get("username", "")
        national_id = rec.get("national_id", "")
        class_name = rec.get("class_name", "")

        if not first_name:
            errors.append("نام خالی است.")
        if not last_name:
            errors.append("نام خانوادگی خالی است.")
        if not username:
            errors.append("نام کاربری خالی است.")
        elif not USERNAME_RE.match(username):
            errors.append("نام کاربری باید ۳ تا ۳۲ کاراکتر و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره باشد.")
        if not national_id:
            errors.append("کد ملی خالی است.")
        elif not national_id_is_valid(national_id):
            errors.append("کد ملی معتبر نیست.")

        if national_id:
            if national_id in seen_nid:
                errors.append(f"کد ملی تکراری در فایل (ردیف {seen_nid[national_id]}).")
            else:
                seen_nid[national_id] = row_number
        if username:
            if username in seen_username:
                errors.append(f"نام کاربری تکراری در فایل (ردیف {seen_username[username]}).")
            else:
                seen_username[username] = row_number

        classroom = classes.get(class_name)
        if not class_name:
            errors.append("نام کلاس خالی است.")
        elif classroom is None:
            errors.append(f"کلاس «{class_name}» در سال تحصیلی {year} وجود ندارد.")

        existing = users_by_nid.get(national_id) if national_id else None
        username_owner = users_by_username.get(username) if username else None
        if username_owner and existing and username_owner.pk != existing.pk:
            errors.append("این نام کاربری به کاربر دیگری تعلق دارد.")
        if username_owner and not existing:
            errors.append("این نام کاربری قبلاً برای کاربر دیگری ثبت شده است.")
        if existing and existing.role != "student":
            errors.append("این کد ملی متعلق به یک حساب غیردانش‌آموزی است.")
        if existing and national_id and existing.national_id != national_id:
            errors.append("تناقض در کد ملی.")

        action = "error" if errors else ("update" if existing else "create")
        plan.append(
            {
                "row": row_number,
                "first_name": first_name,
                "last_name": last_name,
                "username": username,
                "national_id_masked": ("*" * 6 + national_id[-4:]) if national_id else "",
                "class_name": class_name,
                "action": action,
                "errors": errors,
                "_national_id": national_id,
                "_class": classroom,
                "_user": existing,
            }
        )

    summary = {
        "total": len(plan),
        "create": sum(1 for item in plan if item["action"] == "create"),
        "update": sum(1 for item in plan if item["action"] == "update"),
        "error": sum(1 for item in plan if item["action"] == "error"),
    }
    return plan, summary


def apply_plan(plan, year):
    """Apply a validated plan in one transaction."""
    created = updated = 0
    with transaction.atomic():
        for item in plan:
            if item["action"] not in {"create", "update"}:
                continue
            classroom = item["_class"]
            user = item["_user"]
            if user is None:
                user = User(
                    username=item["username"],
                    first_name=item["first_name"],
                    last_name=item["last_name"],
                    national_id=item["_national_id"],
                    role="student",
                    must_change_password=True,
                    is_active=True,
                )
                user.set_password(item["_national_id"])
                user.save()
                created += 1
            else:
                user.first_name = item["first_name"]
                user.last_name = item["last_name"]
                user.username = item["username"]
                user.is_active = True
                user.save(update_fields=["first_name", "last_name", "username", "is_active", "updated_at"])
                updated += 1

            Enrollment.objects.update_or_create(
                student=user,
                year=year,
                defaults={"class_room": classroom, "is_active": True},
            )
    return {"created": created, "updated": updated}
