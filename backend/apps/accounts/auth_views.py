from django.conf import settings
from django.contrib.auth import authenticate, login, logout, update_session_auth_hash
from django.middleware.csrf import get_token
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import client_ip, log_action
from apps.core.exceptions import DomainError
from apps.core.text import national_id_variants, to_persian_digits

from . import captcha
from .models import User
from .serializers import ChangePasswordSerializer, LoginSerializer, UserSerializer
from .throttle import lock_remaining_seconds, register_failure, reset_failures, throttle_key


def session_payload(user, request):
    return {
        "user": UserSerializer(user, context={"request": request}).data,
        "mustChangePassword": user.must_change_password,
        "role": user.role,
    }


class CsrfView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({"csrfToken": get_token(request)})


class CaptchaView(APIView):
    """Issue one drag-the-puzzle challenge. Never cached by the browser."""

    permission_classes = [AllowAny]

    def get(self, request):
        payload = captcha.create_challenge(client_ip(request))
        if payload is None:
            return Response(
                {"error": "تعداد تلاش‌ها زیاد است. یک دقیقه دیگر دوباره امتحان کنید.", "code": "throttled"},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": "60"},
            )
        response = Response(payload)
        response["Cache-Control"] = "no-store, max-age=0"
        return response


class CaptchaVerifyView(APIView):
    """Check the piece position the moment the visitor lets go.

    One chance per puzzle: a wrong position deletes the challenge, so the next
    attempt always starts with a brand-new image.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        ok, reason = captcha.check(
            request.data.get("captcha_token"),
            request.data.get("captcha_x"),
        )
        if not ok:
            log_action("auth.captcha_failed", request=request, meta={"reason": reason})
            return Response(
                {"error": "جای قطعه درست نیست؛ پازل تازه آماده شد.", "code": "captcha"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({"ok": True})


def _find_student_password(username, password):
    """Students often type a national ID without its leading zero.

    The stored password is always the zero-padded 10-digit form, so try the
    common variants after the normal authentication has failed. This is only
    done for student accounts and only when the typed value is numeric.
    """
    candidate = User.objects.filter(username__iexact=username, role="student", is_active=True).first()
    if candidate is None or not candidate.national_id:
        return None
    for variant in national_id_variants(password):
        if variant != password and candidate.check_password(variant):
            return candidate
    return None


def _find_inactive_user(username, password):
    """Return the account when the credentials are right but it is disabled.

    Django's ``authenticate`` returns ``None`` for inactive users, which used to
    hide the real reason behind a generic "wrong password" message.
    """
    candidate = User.objects.filter(username__iexact=username, is_active=False).first()
    if candidate is None:
        return None
    if candidate.check_password(password):
        return candidate
    if candidate.role == "student" and candidate.national_id:
        for variant in national_id_variants(password):
            if variant != password and candidate.check_password(variant):
                return candidate
    return None


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        username = serializer.validated_data["username"]
        password = serializer.validated_data["password"]
        ip = client_ip(request)
        key = throttle_key(username, ip)

        remaining = lock_remaining_seconds(key)
        if remaining:
            return Response(
                {
                    "error": f"حساب شما موقتاً قفل است. {to_persian_digits(max(remaining // 60, 1))} دقیقه دیگر دوباره تلاش کنید.",
                    "code": "locked",
                    "retryAfter": remaining,
                },
                status=status.HTTP_429_TOO_MANY_REQUESTS,
                headers={"Retry-After": str(remaining)},
            )

        if settings.CAPTCHA_ENABLED:
            ok, reason, _attempts = captcha.verify(
                serializer.validated_data.get("captcha_token"),
                serializer.validated_data.get("captcha_x"),
            )
            if not ok:
                log_action(
                    "auth.captcha_failed",
                    request=request,
                    meta={"username": username, "reason": reason},
                )
                return Response(
                    {
                        "error": "پازل منقضی شده یا استفاده شده است؛ پازل تازه بگیرید.",
                        "code": "captcha",
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        user = authenticate(request, username=username, password=password)
        if user is None:
            user = _find_student_password(username, password)
        if user is None:
            inactive = _find_inactive_user(username, password)
            if inactive is not None:
                log_action(
                    "auth.login_inactive",
                    request=request,
                    meta={"username": username},
                    level="warning",
                )
                return Response(
                    {
                        "error": "حساب شما توسط مدیر مدرسه غیرفعال شده است. برای فعال‌سازی با دفتر مدرسه تماس بگیرید.",
                        "code": "inactive",
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )
            register_failure(key)
            log_action("auth.login_failed", request=request, meta={"username": username})
            return Response(
                {"error": "نام کاربری یا رمز عبور درست نیست.", "code": "invalid_credentials"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        if not user.is_active:
            return Response(
                {
                    "error": "حساب شما توسط مدیر مدرسه غیرفعال شده است. برای فعال‌سازی با دفتر مدرسه تماس بگیرید.",
                    "code": "inactive",
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        reset_failures(key)
        request.session.cycle_key()
        login(request, user)
        user.last_login = timezone.now()
        user.save(update_fields=["last_login"])
        log_action("auth.login", user=user, request=request, meta={"captcha": settings.CAPTCHA_ENABLED})
        return Response(session_payload(user, request))


class LogoutView(APIView):
    def post(self, request):
        log_action("auth.logout", user=request.user, request=request)
        logout(request)
        return Response({"ok": True})


class MeView(APIView):
    def get(self, request):
        return Response(session_payload(request.user, request))


class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        user = request.user
        user.set_password(serializer.validated_data["new_password"])
        user.must_change_password = False
        user.save(update_fields=["password", "must_change_password", "updated_at"])
        update_session_auth_hash(request, user)
        if user.role in {"admin", "teacher"}:
            from .ftp import sync_ftp_account

            sync_ftp_account(user, plain_password=serializer.validated_data["new_password"])
            from .portal import push_user

            push_user(user)
        log_action("auth.password_changed", user=user, request=request)
        return Response(session_payload(user, request))
