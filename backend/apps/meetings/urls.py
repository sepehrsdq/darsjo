from django.urls import path

from . import views

urlpatterns = [
    path("offerings/<int:offering_id>/sessions", views.create_session_view, name="session-create"),
    path("sessions/<int:session_id>", views.session_detail_view, name="session-detail"),
    path("sessions/<int:session_id>/start", views.start_session_view, name="session-start"),
    path("sessions/<int:session_id>/join", views.join_session_view, name="session-join"),
    path("sessions/<int:session_id>/end", views.end_session_view, name="session-end"),
    path("offerings/<int:offering_id>/guests", views.offering_guests_view, name="offering-guests"),
    path("guest/<str:token>", views.guest_info_view, name="guest-info"),
    path("guest/<str:token>/join", views.guest_join_view, name="guest-join"),
    path("offerings/<int:offering_id>/start", views.start_meeting, name="meeting-start"),
    path("offerings/<int:offering_id>/join", views.join_meeting, name="meeting-join"),
    path("offerings/<int:offering_id>/state", views.meeting_state, name="meeting-state"),
    path("offerings/<int:offering_id>/end", views.end_meeting, name="meeting-end"),
    path("offerings/<int:offering_id>/recordings/refresh", views.refresh_recordings, name="recordings-refresh"),
    path("recordings/<int:recording_id>/download", views.recording_download, name="recording-download"),
]
