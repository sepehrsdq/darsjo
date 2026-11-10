from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.core.exceptions import DomainError
from apps.meetings.models import GuestAttendance, Recording, Session
from apps.meetings.services import (
    create_session,
    end_session,
    guest_join,
    guest_url,
    join_session,
    running_meeting_ids,
    start_class,
    start_session,
    student_join,
    sync_recordings,
)

from .helpers import (
    FakeBBB,
    enroll,
    make_admin,
    make_classroom,
    make_offering,
    make_student,
    make_teacher,
)


class MeetingServiceTests(TestCase):
    def setUp(self):
        cache.clear()
        self.bbb = FakeBBB()
        patcher = patch("apps.meetings.services.BBBClient", return_value=self.bbb)
        self.addCleanup(patcher.stop)
        patcher.start()

        self.teacher = make_teacher("teacher1")
        self.other_teacher = make_teacher("teacher2")
        self.admin = make_admin("admin1")
        self.classroom = make_classroom("سوم الف")
        self.offering = make_offering(self.classroom, self.teacher)
        self.student = make_student("student1", must_change=False)
        enroll(self.student, self.classroom)
        self.outsider = make_student("student2", national_id=None, must_change=False)
        self.session = create_session(self.teacher, self.offering, number=1, title="معرفی فصل")

    def test_create_session_assigns_number_and_room(self):
        self.assertEqual(self.session.number, 1)
        self.assertEqual(self.session.title, "معرفی فصل")
        self.assertEqual(self.session.meeting_id, f"darsjo-{self.offering.pk}-s1")
        self.assertEqual(self.session.status, Session.Status.PLANNED)
        self.assertIsNone(self.session.started_at)

    def test_next_number_is_suggested_when_omitted(self):
        second = create_session(self.teacher, self.offering)
        self.assertEqual(second.number, 2)

    def test_duplicate_number_is_rejected(self):
        with self.assertRaises(DomainError) as ctx:
            create_session(self.teacher, self.offering, number=1)
        self.assertEqual(ctx.exception.code, "duplicate_number")
        self.assertEqual(ctx.exception.status_code, 409)

    def test_only_the_teacher_creates_sessions(self):
        with self.assertRaises(DomainError) as ctx:
            create_session(self.admin, self.offering, number=2)
        self.assertEqual(ctx.exception.code, "teacher_only")
        with self.assertRaises(DomainError) as ctx:
            create_session(self.other_teacher, self.offering, number=2)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_start_opens_the_session_room_without_auto_recording(self):
        result = start_session(self.teacher, self.session)
        self.assertTrue(result["created"])
        self.assertTrue(result["recordingAllowed"])
        self.assertIn("role=MODERATOR", result["url"])
        self.session.refresh_from_db()
        self.assertEqual(self.session.status, Session.Status.RUNNING)
        self.assertIsNotNone(self.session.started_at)
        self.assertIn(self.session.meeting_id, self.bbb.running)

        call = self.bbb.created_kwargs[-1]
        self.assertEqual(call["meeting_id"], self.session.meeting_id)
        self.assertEqual(call["record"], True)
        self.assertFalse(call["auto_start_recording"])
        self.assertTrue(call["logout_url"].endswith(f"/offerings/{self.offering.pk}"))
        self.assertIn("جلسه ۱", call["name"])

    def test_start_is_idempotent(self):
        start_session(self.teacher, self.session)
        second = start_session(self.teacher, self.session)
        self.assertFalse(second["created"])
        self.assertEqual(len(self.bbb.created), 1)
        self.assertEqual(Session.objects.get(pk=self.session.pk).status, Session.Status.RUNNING)

    def test_second_session_cannot_run_at_the_same_time(self):
        start_session(self.teacher, self.session)
        second = create_session(self.teacher, self.offering, number=2)
        with self.assertRaises(DomainError) as ctx:
            start_session(self.teacher, second)
        self.assertEqual(ctx.exception.code, "other_session_running")

    def test_recording_disables_recording_on_the_next_start(self):
        second = create_session(self.teacher, self.offering, number=2)
        Recording.objects.create(record_id="rec-2", offering=self.offering, session=second)
        start_session(self.teacher, second)
        self.assertFalse(self.bbb.created_kwargs[-1]["record"])

    def test_ended_session_cannot_be_reopened(self):
        start_session(self.teacher, self.session)
        end_session(self.teacher, self.session)
        with self.assertRaises(DomainError) as ctx:
            start_session(self.teacher, self.session)
        self.assertEqual(ctx.exception.code, "session_ended")

    def test_teacher_cannot_start_other_teacher_offering(self):
        with self.assertRaises(DomainError) as ctx:
            start_session(self.other_teacher, self.session)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_admin_cannot_start_but_can_observe_a_running_class(self):
        with self.assertRaises(DomainError) as ctx:
            start_session(self.admin, self.session)
        self.assertEqual(ctx.exception.code, "teacher_only")
        with self.assertRaises(DomainError) as ctx:
            join_session(self.admin, self.session)
        self.assertEqual(ctx.exception.code, "not_running")

        start_session(self.teacher, self.session)
        url = join_session(self.admin, self.session)
        self.assertIn("role=VIEWER", url)
        self.assertIn(f"admin-{self.admin.pk}", url)

    def test_student_join_requires_running_meeting(self):
        with self.assertRaises(DomainError) as ctx:
            join_session(self.student, self.session)
        self.assertEqual(ctx.exception.code, "not_running")

    def test_student_join_after_start(self):
        start_session(self.teacher, self.session)
        url = join_session(self.student, self.session)
        self.assertIn("role=VIEWER", url)
        self.assertIn(self.session.meeting_id, url)

    def test_unenrolled_student_cannot_join(self):
        start_session(self.teacher, self.session)
        with self.assertRaises(DomainError) as ctx:
            join_session(self.outsider, self.session)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_student_can_join_before_bbb_flips_running(self):
        start_session(self.teacher, self.session)
        self.bbb.running.clear()
        cache.clear()
        url = join_session(self.student, self.session)
        self.assertIn("role=VIEWER", url)

    def test_lesson_keeps_one_guest_link_for_every_session(self):
        first_link = guest_url(self.offering)
        self.assertTrue(first_link.endswith(f"/join/{self.offering.guest_token}"))

        second = create_session(self.teacher, self.offering, number=2)
        self.assertEqual(guest_url(self.offering), first_link)
        self.assertEqual(guest_url(second.offering), first_link)

    def test_guest_join_requires_a_running_session(self):
        with self.assertRaises(DomainError) as ctx:
            guest_join(self.offering.guest_token, "علی", "رضایی")
        self.assertEqual(ctx.exception.code, "not_running")

    def test_guest_join_after_start_records_attendance(self):
        start_session(self.teacher, self.session)
        result = guest_join(self.offering.guest_token, "علی", "رضایی", ip="127.0.0.1")
        self.assertIn("role=VIEWER", result["url"])
        self.assertIn("guest-", result["url"])
        self.assertEqual(GuestAttendance.objects.filter(session=self.session).count(), 1)
        self.assertEqual(GuestAttendance.objects.get().full_name, "علی رضایی")

    def test_guest_join_needs_a_full_name(self):
        start_session(self.teacher, self.session)
        with self.assertRaises(DomainError) as ctx:
            guest_join(self.offering.guest_token, "ع", "ر")
        self.assertEqual(ctx.exception.code, "invalid_name")

    def test_stable_link_goes_back_to_waiting_between_sessions(self):
        start_session(self.teacher, self.session)
        guest_join(self.offering.guest_token, "علی", "رضایی")
        end_session(self.teacher, self.session)
        with self.assertRaises(DomainError) as ctx:
            guest_join(self.offering.guest_token, "سارا", "احمدی")
        self.assertEqual(ctx.exception.code, "not_running")

        second = create_session(self.teacher, self.offering, number=2)
        start_session(self.teacher, second)
        result = guest_join(self.offering.guest_token, "سارا", "احمدی")
        self.assertEqual(result["session"].pk, second.pk)
        self.assertEqual(GuestAttendance.objects.filter(session=second).count(), 1)

    def test_stale_session_does_not_count_as_running(self):
        Session.objects.filter(pk=self.session.pk).update(
            status=Session.Status.RUNNING,
            started_at=timezone.now() - timedelta(hours=2),
        )
        cache.clear()
        self.assertNotIn(self.session.meeting_id, running_meeting_ids(self.bbb))

    def test_sync_recordings_attaches_to_the_session(self):
        self.bbb.get_recordings = lambda meeting_id=None, record_id=None: [
            {
                "record_id": "rec-1",
                "meeting_id": self.session.meeting_id,
                "name": "ریاضی — سوم الف — جلسه 1",
                "published": True,
                "start_time": "1794076578340",
                "end_time": "1794076624558",
                "duration_seconds": 46,
                "size_bytes": 1000,
                "playback_url": "https://bbb.test/playback/rec-1",
                "formats": [],
            }
        ]
        self.assertEqual(sync_recordings(self.offering), 1)
        recording = Recording.objects.get(record_id="rec-1")
        self.assertEqual(recording.session_id, self.session.pk)
        self.assertEqual(recording.duration_seconds, 46)
        self.assertIsNotNone(recording.published_at)

    def test_legacy_room_recording_goes_to_the_first_session(self):
        self.bbb.get_recordings = lambda meeting_id=None, record_id=None: [
            {
                "record_id": "rec-legacy",
                "meeting_id": f"darsjo-{self.offering.pk}",
                "name": "قدیمی",
                "published": True,
                "start_time": "1794076578340",
                "end_time": "1794076624558",
                "duration_seconds": 10,
                "size_bytes": 10,
                "playback_url": "https://bbb.test/playback/legacy",
                "formats": [],
            }
        ]
        sync_recordings(self.offering)
        self.assertEqual(Recording.objects.get(record_id="rec-legacy").session_id, self.session.pk)

    def test_legacy_helpers_use_the_numbered_session(self):
        result = start_class(self.teacher, self.offering)
        self.assertEqual(result["session"].pk, self.session.pk)
        url = student_join(self.student, self.offering)
        self.assertIn("role=VIEWER", url)


class SessionApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.bbb = FakeBBB()
        patcher = patch("apps.meetings.services.BBBClient", return_value=self.bbb)
        self.addCleanup(patcher.stop)
        patcher.start()
        self.teacher = make_teacher("teacher1")
        self.admin = make_admin("admin1")
        self.classroom = make_classroom("سوم الف")
        self.offering = make_offering(self.classroom, self.teacher)
        self.client = APIClient()

    def test_teacher_creates_and_starts_a_session(self):
        self.client.force_login(self.teacher)
        created = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions",
            {"number": 3, "title": "حل تمرین"},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.data)
        self.assertEqual(created.data["number"], 3)
        self.assertEqual(created.data["label"], "جلسه ۳ — حل تمرین")

        started = self.client.post(f"/api/sessions/{created.data['id']}/start")
        self.assertEqual(started.status_code, 200, started.data)
        self.assertTrue(started.data["recordingAllowed"])
        self.assertIn("role=MODERATOR", started.data["joinUrl"])

        detail = self.client.get(f"/api/offerings/{self.offering.pk}")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.data["isRunning"])
        self.assertEqual(detail.data["nextSessionNumber"], 4)
        session_payload = detail.data["sessions"][0]
        self.assertEqual(session_payload["status"], "running")
        self.assertTrue(session_payload["isRunning"])

    def test_stable_guest_link_is_public_and_joinable(self):
        self.client.force_login(self.teacher)
        detail = self.client.get(f"/api/offerings/{self.offering.pk}")
        self.assertTrue(detail.data["guestUrl"].endswith(self.offering.guest_token))
        token = self.offering.guest_token
        anonymous = APIClient()

        info = anonymous.get(f"/api/guest/{token}")
        self.assertEqual(info.status_code, 200)
        self.assertFalse(info.data["running"])
        blocked = anonymous.post(
            f"/api/guest/{token}/join",
            {"firstName": "علی", "lastName": "رضایی"},
            format="json",
        )
        self.assertEqual(blocked.status_code, 409)

        created = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        self.client.post(f"/api/sessions/{created.data['id']}/start")
        joined = anonymous.post(
            f"/api/guest/{token}/join",
            {"firstName": "علی", "lastName": "رضایی"},
            format="json",
        )
        self.assertEqual(joined.status_code, 200, joined.data)
        self.assertIn("role=VIEWER", joined.data["joinUrl"])

        guests = self.client.get(f"/api/offerings/{self.offering.pk}/guests")
        self.assertEqual(guests.status_code, 200)
        self.assertEqual(guests.data["items"][0]["fullName"], "علی رضایی")
        self.assertEqual(guests.data["items"][0]["sessionNumber"], 1)

        # The same link is still the lesson's link after this session ends.
        self.client.post(f"/api/sessions/{created.data['id']}/end")
        again = anonymous.get(f"/api/guest/{token}")
        self.assertEqual(again.status_code, 200)
        self.assertFalse(again.data["running"])

        second = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 2}, format="json"
        )
        self.client.post(f"/api/sessions/{second.data['id']}/start")
        rejoin = anonymous.post(
            f"/api/guest/{token}/join",
            {"firstName": "سارا", "lastName": "احمدی"},
            format="json",
        )
        self.assertEqual(rejoin.status_code, 200, rejoin.data)

    def test_admin_can_observe_but_never_start_from_the_api(self):
        self.client.force_login(self.teacher)
        created = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        self.client.post(f"/api/sessions/{created.data['id']}/start")

        self.client.force_login(self.admin)
        detail = self.client.get(f"/api/offerings/{self.offering.pk}")
        self.assertEqual(detail.status_code, 200)
        self.assertTrue(detail.data["guestUrl"].endswith(self.offering.guest_token))

        joined = self.client.post(f"/api/sessions/{created.data['id']}/join")
        self.assertEqual(joined.status_code, 200, joined.data)
        self.assertIn("role=VIEWER", joined.data["joinUrl"])
        self.assertIn(f"admin-{self.admin.pk}", joined.data["joinUrl"])

        denied = self.client.post(f"/api/sessions/{created.data['id']}/start")
        self.assertEqual(denied.status_code, 403)

    def test_profile_marks_the_running_session(self):
        self.client.force_login(self.teacher)
        created = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        self.client.post(f"/api/sessions/{created.data['id']}/start")
        profile = self.client.get("/api/profile")
        self.assertEqual(profile.status_code, 200)
        offering = profile.data["offerings"][0]
        self.assertTrue(offering["isRunning"])
        self.assertEqual(offering["sessions"][0]["status"], "running")

    def test_duplicate_number_returns_conflict(self):
        self.client.force_login(self.teacher)
        self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        again = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        self.assertEqual(again.status_code, 409)
        self.assertEqual(again.data["code"], "duplicate_number")

    def test_student_and_admin_cannot_create_sessions(self):
        student = make_student("student1", must_change=False)
        enroll(student, self.classroom)
        self.client.force_login(student)
        self.assertEqual(
            self.client.post(
                f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
            ).status_code,
            403,
        )
        self.client.force_login(self.admin)
        self.assertEqual(
            self.client.post(
                f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
            ).status_code,
            403,
        )

    def test_ended_session_delete_waits_for_recording_processing(self):
        self.client.force_login(self.teacher)
        created = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        session_id = created.data["id"]
        self.client.post(f"/api/sessions/{session_id}/start")
        self.client.post(f"/api/sessions/{session_id}/end")
        blocked = self.client.delete(f"/api/sessions/{session_id}")
        self.assertEqual(blocked.status_code, 409)
        self.assertEqual(blocked.data["code"], "recording_pending")
        Session.objects.filter(pk=session_id).update(
            ended_at=timezone.now() - timedelta(hours=3)
        )
        self.assertEqual(self.client.delete(f"/api/sessions/{session_id}").status_code, 204)

    def test_update_and_delete_planned_session(self):
        self.client.force_login(self.teacher)
        created = self.client.post(
            f"/api/offerings/{self.offering.pk}/sessions", {"number": 1}, format="json"
        )
        session_id = created.data["id"]
        patched = self.client.patch(
            f"/api/sessions/{session_id}", {"title": "عنوان تازه"}, format="json"
        )
        self.assertEqual(patched.status_code, 200)
        self.assertEqual(patched.data["title"], "عنوان تازه")
        deleted = self.client.delete(f"/api/sessions/{session_id}")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(Session.objects.filter(pk=session_id).exists())
