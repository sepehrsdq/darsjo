"""Seed a realistic demo school: idempotent, safe to re-run."""

import datetime
import random

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.academic.models import ClassRoom, Enrollment, Offering, ScheduleSlot, Subject
from apps.accounts.models import User
from apps.core.text import build_national_id as make_national_id

YEARS = "1405-1406"
CLASSES = [("سوم الف", 3), ("سوم ب", 3), ("چهارم الف", 4), ("چهارم ب", 4)]
SUBJECTS = [
    ("ریاضی", "#0D9488", "calculator"),
    ("علوم", "#2563EB", "flask"),
    ("فارسی", "#D97706", "book-open"),
    ("قرآن", "#7C3AED", "book"),
    ("اجتماعی", "#DB2777", "globe"),
    ("هنر", "#F59E0B", "palette"),
]
FIRST_NAMES = ["علی", "زهرا", "محمد", "فاطمه", "امیر", "سارا", "رضا", "مریم", "حسین", "نرگس"]
LAST_NAMES = ["رضایی", "محمدی", "حسینی", "کریمی", "نوری", "احمدی", "صادقی", "موسوی"]


class Command(BaseCommand):
    help = "Create demo classes, subjects, teachers, students and offerings."

    def add_arguments(self, parser):
        parser.add_argument("--students", type=int, default=24, help="students per class")
        parser.add_argument(
            "--force",
            action="store_true",
            help="allow seeding outside DEBUG (accounts get known passwords)",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG and not options["force"]:
            raise CommandError(
                "seed_demo creates accounts with known passwords. Run it locally "
                "or pass --force if this is a throwaway demo server."
            )
        random.seed(1405)
        per_class = options["students"]

        admin, created = User.objects.get_or_create(
            username="admin",
            defaults={"first_name": "مدیر", "last_name": "سامانه", "role": "admin", "is_staff": True},
        )
        if created:
            admin.set_password("Admin@1405pass")
            admin.save()

        teachers = []
        for index, name in enumerate(["خانم رضایی", "آقای محمدی", "خانم کریمی", "آقای نوری"], start=1):
            username = f"teacher{index}"
            first_name, _, last_name = name.partition(" ")
            teacher, created = User.objects.get_or_create(
                username=username,
                defaults={"first_name": first_name, "last_name": last_name, "role": "teacher"},
            )
            if created:
                teacher.set_password("Teacher@1405")
            teacher.first_name = first_name
            teacher.last_name = last_name
            teacher.role = "teacher"
            teacher.save()
            teachers.append(teacher)

        subjects = []
        for title, color, icon in SUBJECTS:
            subject, _ = Subject.objects.update_or_create(title=title, defaults={"color": color, "icon": icon})
            subjects.append(subject)

        rooms = []
        for name, grade in CLASSES:
            room, _ = ClassRoom.objects.get_or_create(name=name, year=YEARS, defaults={"grade": grade})
            if room.grade != grade:
                room.grade = grade
                room.save(update_fields=["grade"])
            rooms.append(room)

        offerings = []
        for room_index, room in enumerate(rooms):
            for subject_index, subject in enumerate(subjects):
                teacher = teachers[(room_index + subject_index) % len(teachers)]
                offering, _ = Offering.objects.get_or_create(
                    class_room=room, subject=subject, year=YEARS, defaults={"teacher": teacher}
                )
                offering.teacher = teacher
                offering.save(update_fields=["teacher"])
                offerings.append(offering)
                ScheduleSlot.objects.filter(offering=offering).delete()
                day = (subject_index + room_index) % 5
                start = datetime.time(8 + subject_index, 0)
                end = datetime.time(8 + subject_index, 45)
                ScheduleSlot.objects.create(offering=offering, weekday=day, start_time=start, end_time=end)

        counter = 0
        for room in rooms:
            for index in range(per_class):
                counter += 1
                first = FIRST_NAMES[counter % len(FIRST_NAMES)]
                last = LAST_NAMES[(counter * 3) % len(LAST_NAMES)]
                username = f"student{counter:03d}"
                national_id = make_national_id(20_000_000 + counter)
                student, created = User.objects.get_or_create(
                    username=username,
                    defaults={
                        "first_name": first,
                        "last_name": last,
                        "role": "student",
                        "national_id": national_id,
                        "must_change_password": True,
                    },
                )
                if created:
                    student.set_password(national_id)
                    student.save()
                Enrollment.objects.update_or_create(
                    student=student, year=YEARS, defaults={"class_room": room, "is_active": True}
                )

        self.stdout.write(
            self.style.SUCCESS(
                f"seed ok: {len(rooms)} classes, {len(subjects)} subjects, {len(teachers)} teachers, "
                f"{User.objects.filter(role='student').count()} students, {len(offerings)} offerings"
            )
        )
        self.stdout.write("admin / Admin@1405pass  •  teacher1 / Teacher@1405  •  student001 / <national id>")
