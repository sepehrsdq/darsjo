from rest_framework.permissions import BasePermission


class IsAdmin(BasePermission):
    message = "این بخش فقط برای مدیر سامانه است."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "admin")


class IsTeacher(BasePermission):
    message = "این بخش فقط برای معلمان است."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "teacher")


class IsStudent(BasePermission):
    message = "این بخش فقط برای دانش‌آموزان است."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.role == "student")


class IsAdminOrTeacher(BasePermission):
    message = "دسترسی مجاز نیست."

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.role in {"admin", "teacher"}
        )
