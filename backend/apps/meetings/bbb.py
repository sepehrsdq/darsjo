"""Thin BigBlueButton API client (checksum auth, server side only)."""

import hashlib
import logging
import xml.etree.ElementTree as ET
from urllib.parse import quote, urlencode

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


class BBBError(Exception):
    def __init__(self, message, message_key=""):
        super().__init__(message)
        self.message = message
        self.message_key = message_key


class BBBClient:
    def __init__(self, base_url=None, secret=None, timeout=None, verify_tls=None):
        self.base_url = (base_url or settings.BBB_URL).rstrip("/")
        self.secret = secret or settings.BBB_SECRET
        self.timeout = timeout or settings.BBB_TIMEOUT
        self.verify_tls = settings.BBB_VERIFY_TLS if verify_tls is None else verify_tls

    def checksum(self, call, query):
        return hashlib.sha1(f"{call}{query}{self.secret}".encode("utf-8")).hexdigest()

    def _call(self, call, params=None):
        params = dict(params or {})
        query = urlencode(params, quote_via=quote)
        payload = f"{query}&checksum={self.checksum(call, query)}" if query else f"checksum={self.checksum(call, query)}"
        url = f"{self.base_url}/{call}?{payload}"
        try:
            response = requests.get(url, timeout=self.timeout, verify=self.verify_tls)
        except requests.RequestException as exc:
            raise BBBError("ارتباط با سرور کلاس برقرار نشد.") from exc
        if response.status_code >= 500:
            raise BBBError("سرور کلاس پاسخ نداد. کمی بعد دوباره تلاش کنید.")
        try:
            root = ET.fromstring(response.content)
        except ET.ParseError as exc:
            raise BBBError("پاسخ سرور کلاس قابل خواندن نبود.") from exc
        if root.findtext("returncode") != "SUCCESS":
            key = root.findtext("messageKey") or ""
            message = root.findtext("message") or "خطای سرور کلاس"
            raise BBBError(message, key)
        return root

    # ------------------------------------------------------------------ API
    def create_meeting(
        self,
        meeting_id,
        name,
        attendee_pw,
        moderator_pw,
        record=True,
        max_participants=200,
        welcome="به کلاس خوش آمدید",
        duration_minutes=240,
        logout_url="",
        auto_start_recording=False,
    ):
        return self._call(
            "create",
            {
                "meetingID": meeting_id,
                "name": name,
                "attendeePW": attendee_pw,
                "moderatorPW": moderator_pw,
                "welcome": welcome,
                "dialNumber": "",
                "voiceBridge": "",
                "maxParticipants": max_participants,
                "logoutURL": logout_url,
                "record": "true" if record else "false",
                "duration": duration_minutes,
                # The school asked for one manual recording per session: the
                # teacher presses record inside the room, nothing starts by
                # itself a couple of minutes into the class.
                "allowStartStopRecording": "true" if record else "false",
                "autoStartRecording": "true" if auto_start_recording else "false",
            },
        )

    def join_url(self, meeting_id, full_name, user_id, role, password, avatar_url=""):
        params = {
            "meetingID": meeting_id,
            "fullName": full_name,
            "password": password,
            "userID": str(user_id),
            "role": role,
            "redirect": "true",
        }
        if avatar_url:
            params["avatarURL"] = avatar_url
        query = urlencode(params, quote_via=quote)
        return f"{self.base_url}/join?{query}&checksum={self.checksum('join', query)}"

    def is_meeting_running(self, meeting_id):
        try:
            root = self._call("isMeetingRunning", {"meetingID": meeting_id})
        except BBBError:
            return False
        return root.findtext("running") == "true"

    def end_meeting(self, meeting_id, moderator_pw):
        try:
            return self._call("end", {"meetingID": meeting_id, "password": moderator_pw})
        except BBBError as exc:
            if exc.message_key in {"notFound", "invalidMeetingIdentifier"}:
                return None
            raise

    def get_meetings(self):
        root = self._call("getMeetings")
        meetings = []
        for node in root.findall("./meetings/meeting"):
            meetings.append(
                {
                    "meeting_id": node.findtext("meetingID", ""),
                    "name": node.findtext("meetingName", ""),
                    "participant_count": int(node.findtext("participantCount", "0") or 0),
                    "start_time": node.findtext("startTime", ""),
                    "running": node.findtext("running", "false") == "true",
                }
            )
        return meetings

    def get_recordings(self, meeting_id=None, record_id=None):
        params = {}
        if meeting_id:
            params["meetingID"] = meeting_id
        if record_id:
            params["recordID"] = record_id
        root = self._call("getRecordings", params)
        results = []
        for node in root.findall("./recordings/recording"):
            formats = []
            for fmt in node.findall("./playback/format"):
                fmt_type = fmt.findtext("type", "")
                fmt_url = fmt.findtext("url", "")
                if not fmt_url:
                    continue
                if fmt_type in {"presentation", "video"} and "2.0" in fmt_url:
                    fmt_url = fmt_url.replace("/2.0/", "/2.0/")
                formats.append({"type": fmt_type, "url": fmt_url})
            best = next((f for f in formats if f["type"] == "presentation"), None) or (formats[0] if formats else None)
            # BBB 2.3 reports the length per playback format; when the format
            # has no media events it is 0, so fall back to endTime - startTime.
            lengths = []
            for fmt in node.findall("./playback/format"):
                try:
                    lengths.append(int(float(fmt.findtext("length", "0") or 0)))
                except (TypeError, ValueError):
                    continue
            duration_seconds = max(lengths, default=0)
            if not duration_seconds:
                try:
                    duration_seconds = max(
                        int((int(node.findtext("endTime", "0") or 0) - int(node.findtext("startTime", "0") or 0)) / 1000),
                        0,
                    )
                except (TypeError, ValueError):
                    duration_seconds = 0
            results.append(
                {
                    "record_id": node.findtext("recordID", ""),
                    "meeting_id": node.findtext("meetingID", ""),
                    "name": node.findtext("name", ""),
                    "published": node.findtext("published", "false") == "true",
                    "start_time": node.findtext("startTime", ""),
                    "end_time": node.findtext("endTime", ""),
                    "duration_seconds": duration_seconds,
                    "size_bytes": int(node.findtext("size", "0") or 0),
                    "playback_url": best["url"] if best else "",
                    "formats": formats,
                }
            )
        return results

    def delete_recordings(self, record_ids):
        if not record_ids:
            return False
        root = self._call("deleteRecordings", {"recordID": ",".join(record_ids)})
        return root.findtext("deleted") == "true"
