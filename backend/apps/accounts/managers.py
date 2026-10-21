from django.contrib.auth.base_user import BaseUserManager


class UserManager(BaseUserManager):
    use_in_migrations = True

    def _create(self, username, password, **extra):
        if not username:
            raise ValueError("نام کاربری الزامی است.")
        user = self.model(username=username.strip().lower(), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_user(self, username, password=None, **extra):
        extra.setdefault("role", "student")
        return self._create(username, password, **extra)

    def create_superuser(self, username, password=None, **extra):
        extra.update(role="admin", is_staff=True, is_superuser=True, is_active=True)
        return self._create(username, password, **extra)

    def teachers(self):
        return self.filter(role="teacher", is_active=True)

    def students(self):
        return self.filter(role="student", is_active=True)

    def admins(self):
        return self.filter(role="admin", is_active=True)
