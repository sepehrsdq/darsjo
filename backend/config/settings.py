"""Django settings for the Imam school LMS."""
import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env(key, default=None):
    value = os.environ.get(key)
    return default if value in (None, "") else value


def env_bool(key, default=False):
    return str(env(key, str(default))).strip().lower() in {"1", "true", "yes", "on"}


def env_list(key, default=""):
    raw = env(key, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = env("DJANGO_SECRET_KEY", "dev-only-insecure-key-change-me")
DEBUG = env_bool("DJANGO_DEBUG", False)
ALLOWED_HOSTS = env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,kelaas.example.ir")
CSRF_TRUSTED_ORIGINS = env_list("DJANGO_CSRF_TRUSTED_ORIGINS", "https://kelaas.example.ir")

# ---------------------------------------------------------------- applications
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "apps.accounts",
    "apps.academic",
    "apps.meetings",
    "apps.importer",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "apps.audit.middleware.RequestContextMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "apps.accounts.middleware.MustChangePasswordMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# ---------------------------------------------------------------- database
if env("POSTGRES_DB"):
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": env("POSTGRES_DB"),
            "USER": env("POSTGRES_USER", "darsjo"),
            "PASSWORD": env("POSTGRES_PASSWORD", ""),
            "HOST": env("POSTGRES_HOST", "127.0.0.1"),
            "PORT": env("POSTGRES_PORT", "5432"),
            "CONN_MAX_AGE": 60,
            "OPTIONS": {"connect_timeout": 10},
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = []
PASSWORD_HASHERS = [
    # Shared with the file panel (Node) so one password works on both systems.
    "apps.accounts.hashers.PortalScryptHasher",
    "django.contrib.auth.hashers.Argon2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2PasswordHasher",
    "django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher",
    "django.contrib.auth.hashers.BCryptSHA256PasswordHasher",
]

LANGUAGE_CODE = "fa-ir"
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
MEDIA_URL = "/media/"
MEDIA_ROOT = Path(env("MEDIA_ROOT", BASE_DIR / "media"))

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# ---------------------------------------------------------------- cache
# gunicorn runs several workers, so the captcha challenge and the live-class
# cache must be shared between them. A file cache needs no extra service and
# works on the national network without any outbound request.
CACHE_DIR = Path(env("CACHE_DIR", str(BASE_DIR / ".cache")))
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.filebased.FileBasedCache",
        "LOCATION": str(CACHE_DIR),
        "TIMEOUT": 300,
        "OPTIONS": {"MAX_ENTRIES": 5000},
    }
}

# ---------------------------------------------------------------- security
SESSION_ENGINE = "django.contrib.sessions.backends.db"
SESSION_COOKIE_NAME = "darsjo_session"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SECURE = env_bool("SESSION_COOKIE_SECURE", not DEBUG)
SESSION_COOKIE_SAMESITE = "Lax"
SESSION_COOKIE_AGE = int(env("SESSION_COOKIE_AGE", "28800"))
SESSION_SAVE_EVERY_REQUEST = True
CSRF_COOKIE_HTTPONLY = False  # the SPA reads it to build the X-CSRFToken header
CSRF_COOKIE_SECURE = env_bool("CSRF_COOKIE_SECURE", not DEBUG)
CSRF_COOKIE_SAMESITE = "Lax"
CSRF_HEADER_NAME = "HTTP_X_CSRFTOKEN"
SECURE_SSL_REDIRECT = env_bool("SECURE_SSL_REDIRECT", False)  # TLS terminates at haproxy/nginx
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
X_FRAME_OPTIONS = "DENY"
SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "same-origin"

# login throttling
LOGIN_MAX_FAILURES = int(env("LOGIN_MAX_FAILURES", "5"))
LOGIN_LOCK_MINUTES = int(env("LOGIN_LOCK_MINUTES", "15"))
LOGIN_WINDOW_MINUTES = int(env("LOGIN_WINDOW_MINUTES", "15"))

# slider (drag the puzzle piece) captcha on the login form
CAPTCHA_ENABLED = env_bool("CAPTCHA_ENABLED", True)
CAPTCHA_TTL_SECONDS = int(env("CAPTCHA_TTL_SECONDS", "180"))
CAPTCHA_TOLERANCE_PX = int(env("CAPTCHA_TOLERANCE_PX", "7"))
CAPTCHA_MAX_PER_MINUTE = int(env("CAPTCHA_MAX_PER_MINUTE", "30"))

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.core.authentication.CsrfSessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticated"],
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
    "DEFAULT_PARSER_CLASSES": [
        "rest_framework.parsers.JSONParser",
        "rest_framework.parsers.MultiPartParser",
    ],
    "EXCEPTION_HANDLER": "apps.core.exceptions.api_exception_handler",
    "DEFAULT_THROTTLE_RATES": {"login": "10/min"},
}

# ---------------------------------------------------------------- BigBlueButton
BBB_URL = env("BBB_URL", "https://bbb.example.ir/bigbluebutton/api")
BBB_SECRET = env("BBB_SECRET", "")
BBB_VERIFY_TLS = env_bool("BBB_VERIFY_TLS", True)
BBB_TIMEOUT = int(env("BBB_TIMEOUT", "15"))

# ---------------------------------------------------------------- school
DEFAULT_ACADEMIC_YEAR = env("DEFAULT_ACADEMIC_YEAR", "1405-1406")
SCHOOL_NAME = env("SCHOOL_NAME", "دبستان مهر")
FILES_ROOT = Path(env("FILES_ROOT", "/srv/files/teachers"))
RECORDINGS_ROOT = Path(env("RECORDINGS_ROOT", "/var/bigbluebutton/published/presentation"))
RECORDING_RETENTION_DAYS = int(env("RECORDING_RETENTION_DAYS", "120"))
# A finished session is protected for this long so its BBB recording can still
# be processed and attached before anyone deletes it.
RECORDING_GRACE_MINUTES = int(env("RECORDING_GRACE_MINUTES", "120"))
# Audit trail retention. The `prune_audit` timer deletes anything older.
AUDIT_RETENTION_DAYS = max(1, int(env("AUDIT_RETENTION_DAYS", "7")))
# A room created by the teacher counts as "running" for this long, even before
# BBB reports a participant (BBB only flips `running` after the first join).
SESSION_START_GRACE_MINUTES = int(env("SESSION_START_GRACE_MINUTES", "15"))
# Absolute address of the LMS front-end. BigBlueButton uses it as logoutURL so
# leaving the room returns to the lesson page, and the file panel uses it for
# recording links.
PUBLIC_BASE_URL = env("PUBLIC_BASE_URL", "https://kelaas.example.ir").rstrip("/")
MAX_AVATAR_BYTES = int(env("MAX_AVATAR_BYTES", str(2 * 1024 * 1024)))
MAX_IMPORT_BYTES = int(env("MAX_IMPORT_BYTES", str(5 * 1024 * 1024)))
FTP_UID = int(env("FTP_UID", "1500"))
FTP_GID = int(env("FTP_GID", "1500"))

# ------------------------------------------------- shared accounts (file panel)
# The file panel (files.example.ir) keeps its own PostgreSQL database. Teachers and
# admins are mirrored there so both systems share one username/password.
PORTAL_DB_HOST = env("PORTAL_DB_HOST", "")
PORTAL_DB_PORT = env("PORTAL_DB_PORT", "5432")
# Internal endpoint used to delete the mirrored account and archive its files.
PORTAL_INTERNAL_URL = env("PORTAL_INTERNAL_URL", "http://127.0.0.1:8190").rstrip("/")
PORTAL_INTERNAL_SECRET = env("PORTAL_INTERNAL_SECRET", "")
PORTAL_DB_NAME = env("PORTAL_DB_NAME", "darsjo_portal")
PORTAL_DB_USER = env("PORTAL_DB_USER", "")
PORTAL_DB_PASSWORD = env("PORTAL_DB_PASSWORD", "")
PORTAL_DB_DEFAULT_QUOTA = int(env("PORTAL_DB_DEFAULT_QUOTA", str(15 * 1024**3)))

# ---------------------------------------------------------------- logging
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "plain": {"format": "[%(asctime)s] %(levelname)s %(name)s: %(message)s"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "plain"},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", "INFO")},
    "loggers": {
        "django.request": {"handlers": ["console"], "level": "WARNING", "propagate": False},
    },
}
