from django.db import models
from django.conf import settings
from django.utils import timezone
from django.contrib.auth import get_user_model
from django.db import transaction


class Role(models.Model):
    ROLE_CHOICES = (
        ("admin", "Admin"),
        ("inventory_manager", "Inventory Manager"),
        ("quality_assistant", "Quality Assistant"),
        ("finance_director", "Finance Director"),
        ("manager", "Manager"),
        ("supervisor", "Supervisor"),
    )

    name = models.CharField(max_length=50, choices=ROLE_CHOICES, unique=True)

    def __str__(self):
        return self.get_name_display()


class Permission(models.Model):
    ACTION_CHOICES = (
        ("create", "Create"),
        ("read", "Read"),
        ("update", "Update"),
        ("delete", "Delete"),
    )

    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    model_name = models.CharField(max_length=100)
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)

    def __str__(self):
        return f"{self.role.name} - {self.model_name} - {self.action}"


class UserRole(models.Model):
    employee_id = models.CharField(max_length=100, unique=True, primary_key=True)
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="user_role"
    )
    role = models.ForeignKey(Role, on_delete=models.CASCADE)
    is_first_login = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.username} - {self.role.name}"


User = get_user_model()


class OTP(models.Model):
    PURPOSE_CHOICES = (
        ("REGISTER", "Register"),
        ("RESET_PASSWORD", "Reset Password"),
        ("LOGIN", "Login"),
    )

    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True)
    email = models.EmailField()
    otp_code = models.CharField(max_length=6)
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)
    expiry_time = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def is_expired(self):
        return timezone.now() > self.expiry_time

    def __str__(self):
        return f"{self.email} - {self.purpose}"


class LoginLogs(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    login_time = models.DateTimeField(auto_now_add=True)
    logout_time = models.DateTimeField(null=True, blank=True)
    ip_address = models.GenericIPAddressField()
    device_info = models.CharField(max_length=255)
    login_status = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.user} - {self.login_time}"