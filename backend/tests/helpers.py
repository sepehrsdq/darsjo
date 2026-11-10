"""Shared helpers for the test suite."""

from django.contrib.auth import get_user_model

from apps.academic.models import ClassRoom, Enrollment, Offering, Subject
from apps.core.text import build_national_id as make_national_id

__all__ = [
    "make_national_id",
    "make_admin",
    "make_teacher",
    "make_student",
    "make_classroom",
    "make_offering",
    "enroll",
    "FakeBBB",
    "YEAR",
]

User = get_user_model()
YEAR = "1405-1406"


def make_admin(username="admin1", password="Admin@1405pass"):
    return User.objects.create_user(
        username=username, password=password, first_name="مدیر", last_name="سامانه", role="admin"
    )


def make_teacher(username="teacher1", password="Teacher@1405", national_id=None):
    return User.objects.create_user(
        username=username,
        password=password,
        first_name="معلم",
        last_name="نمونه",
        role="teacher",
        national_id=national_id,
    )


def make_student(username="student1", national_id=None, password=None, must_change=False):
    if national_id is None:
        import random

        while True:
            candidate = make_national_id(random.randint(10_000_000, 99_999_999))
            if not User.objects.filter(national_id=candidate).exists():
                national_id = candidate
                break
    user = User.objects.create_user(
        username=username,
        password=password or national_id,
        first_name="دانش",
        last_name="آموز",
        role="student",
        national_id=national_id,
        must_change_password=must_change,
    )
    return user


def make_classroom(name="سوم الف", grade=3, year=YEAR):
    return ClassRoom.objects.create(name=name, grade=grade, year=year)


def make_offering(classroom, teacher, title="ریاضی", year=YEAR):
    subject, _ = Subject.objects.get_or_create(title=title)
    return Offering.objects.create(class_room=classroom, subject=subject, teacher=teacher, year=year)


def enroll(student, classroom, year=YEAR):
    return Enrollment.objects.create(student=student, class_room=classroom, year=year)


class FakeBBB:
    """In-memory BBB double used by the service tests."""

    def __init__(self):
        self.running = set()
        self.created = []
        self.created_kwargs = []
        self.ended = []

    def is_meeting_running(self, meeting_id):
        return meeting_id in self.running

    def create_meeting(self, meeting_id, name, attendee_pw, moderator_pw, **kwargs):
        self.created.append(meeting_id)
        self.created_kwargs.append({"meeting_id": meeting_id, "name": name, **kwargs})
        self.running.add(meeting_id)
        return {"meetingID": meeting_id}

    def join_url(self, meeting_id, full_name, user_id, role, password, avatar_url=""):
        return f"https://bbb.test/join?meetingID={meeting_id}&fullName={full_name}&role={role}&userID={user_id}&pwd={password}"

    def get_meetings(self):
        return [{"meeting_id": mid, "running": True} for mid in self.running]

    def end_meeting(self, meeting_id, moderator_pw):
        self.ended.append(meeting_id)
        self.running.discard(meeting_id)
        return True

    def get_recordings(self, meeting_id=None, record_id=None):
        return []

    def delete_recordings(self, record_ids):
        return True
