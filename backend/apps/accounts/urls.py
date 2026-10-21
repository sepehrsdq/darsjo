from django.urls import path

from . import views

urlpatterns = [
    path("profile", views.ProfileView.as_view(), name="profile"),
    path("profile/avatar", views.AvatarView.as_view(), name="profile-avatar"),
    path("admin/users", views.AdminUserView.as_view(), name="admin-users"),
    path("admin/users/<uuid:user_id>", views.AdminUserView.as_view(), name="admin-user-detail"),
    path("admin/users/<uuid:user_id>/reset-password", views.reset_password, name="admin-user-reset"),
    path("admin/stats", views.dashboard_stats, name="admin-stats"),
]
