from django.urls import path

from .auth_views import CaptchaView, CaptchaVerifyView, ChangePasswordView, CsrfView, LoginView, LogoutView, MeView

urlpatterns = [
    path("csrf", CsrfView.as_view(), name="auth-csrf"),
    path("captcha", CaptchaView.as_view(), name="auth-captcha"),
    path("captcha/verify", CaptchaVerifyView.as_view(), name="auth-captcha-verify"),
    path("login", LoginView.as_view(), name="auth-login"),
    path("logout", LogoutView.as_view(), name="auth-logout"),
    path("me", MeView.as_view(), name="auth-me"),
    path("change-password", ChangePasswordView.as_view(), name="auth-change-password"),
]
