from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.core.text import clean_national_id, national_id_is_valid

User = get_user_model()


class UserBriefSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name", read_only=True)
    avatarUrl = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ["id", "username", "first_name", "last_name", "fullName", "role", "avatarUrl"]

    def get_avatarUrl(self, obj):
        return obj.avatar.url if obj.avatar else None


class UserSerializer(serializers.ModelSerializer):
    fullName = serializers.CharField(source="full_name", read_only=True)
    avatarUrl = serializers.SerializerMethodField()
    nationalIdMasked = serializers.CharField(source="masked_national_id", read_only=True)

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "fullName",
            "role",
            "phone",
            "avatarUrl",
            "nationalIdMasked",
            "must_change_password",
            "is_active",
            "date_joined",
            "last_login",
        ]

    def get_avatarUrl(self, obj):
        return obj.avatar.url if obj.avatar else None


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=64)
    password = serializers.CharField(max_length=128, trim_whitespace=False)
    captcha_token = serializers.CharField(max_length=120, required=False, allow_blank=True)
    captcha_x = serializers.FloatField(required=False)

    def validate_username(self, value):
        return value.strip().lower()


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(max_length=128, trim_whitespace=False)
    new_password = serializers.CharField(max_length=128, trim_whitespace=False)
    confirm_password = serializers.CharField(max_length=128, trim_whitespace=False)

    def validate(self, attrs):
        user = self.context["request"].user
        new_password = attrs["new_password"]

        if attrs["new_password"] != attrs["confirm_password"]:
            raise serializers.ValidationError({"confirm_password": "تکرار رمز با رمز جدید یکسان نیست."})
        if not user.check_password(attrs["current_password"]):
            raise serializers.ValidationError({"current_password": "رمز فعلی درست نیست."})
        if len(new_password) < 8:
            raise serializers.ValidationError({"new_password": "رمز جدید باید حداقل ۸ کاراکتر باشد."})
        if new_password.isdigit():
            raise serializers.ValidationError({"new_password": "رمز جدید نباید فقط عدد باشد."})
        if user.national_id and new_password == user.national_id:
            raise serializers.ValidationError({"new_password": "رمز جدید نباید برابر کد ملی باشد."})
        if new_password.lower() == user.username.lower():
            raise serializers.ValidationError({"new_password": "رمز جدید نباید برابر نام کاربری باشد."})
        if new_password == attrs["current_password"]:
            raise serializers.ValidationError({"new_password": "رمز جدید باید با رمز فعلی متفاوت باشد."})
        return attrs


class AdminUserCreateSerializer(serializers.Serializer):
    """Used by the admin user CRUD (phase 2 keeps it here for reuse)."""

    username = serializers.CharField(max_length=64)
    first_name = serializers.CharField(max_length=80)
    last_name = serializers.CharField(max_length=80)
    role = serializers.ChoiceField(choices=["admin", "teacher", "student"])
    national_id = serializers.CharField(max_length=20, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=20, required=False, allow_blank=True)
    password = serializers.CharField(max_length=128, required=False, allow_blank=True)

    def validate_username(self, value):
        username = value.strip().lower()
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError("این نام کاربری قبلاً ثبت شده است.")
        return username

    def validate_national_id(self, value):
        national_id = clean_national_id(value)
        if not national_id:
            return ""
        if not national_id_is_valid(national_id):
            raise serializers.ValidationError("کد ملی معتبر نیست.")
        if User.objects.filter(national_id=national_id).exists():
            raise serializers.ValidationError("این کد ملی قبلاً ثبت شده است.")
        return national_id
