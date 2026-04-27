"""
views.py

Auth flow:
  - Single unified login for ALL users (admin + employees) via employee_id + password → OTP → JWT
  - Admin role: can create users (including other admins), cannot delete any user
  - Non-admin roles: cannot create users
  - Bootstrap: use `python manage.py create_admin` (no HTTP endpoint)
"""

from django.contrib.auth import get_user_model
from rest_framework.views import APIView    
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.utils.timezone import now
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse
from django.core.mail import send_mail

from .models import Role, UserRole, OTP, LoginLogs
from .services import send_otp_email, generate_random_password
from .serializers import (
    RegisterSerializer, LoginSerializer,
    ResetPasswordSerializer, ForgotPasswordSerializer,
    CustomTokenObtainPairSerializer,
)
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken

User = get_user_model()


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def get_user_role(user):
    """Return UserRole for user or None."""
    try:
        return UserRole.objects.select_related("role").get(user=user)
    except UserRole.DoesNotExist:
        return None


def is_admin(user):
    """Return True if user has the admin role."""
    ur = get_user_role(user)
    return ur is not None and ur.role.name == "admin"


def generate_employee_id():
    """Generate next EMP-prefixed employee ID."""
    last = (
        UserRole.objects
        .filter(employee_id__startswith="EMP")
        .order_by("-employee_id")
        .first()
    )
    if last:
        num = int(last.employee_id[3:]) + 1
    else:
        num = 1
    return f"EMP{num:04d}"


def generate_admin_id():
    """Generate next ADM-prefixed employee ID."""
    last = (
        UserRole.objects
        .filter(employee_id__startswith="ADM")
        .order_by("-employee_id")
        .first()
    )
    if last:
        num = int(last.employee_id[3:]) + 1
    else:
        num = 1
    return f"ADM{num:04d}"


# ─────────────────────────────────────────────
# CSRF
# ─────────────────────────────────────────────

@ensure_csrf_cookie
def get_csrf_token(request):
    return JsonResponse({"message": "CSRF cookie set"})


# ─────────────────────────────────────────────
# JWT
# ─────────────────────────────────────────────

class CustomTokenObtainPairView(TokenObtainPairView):
    permission_classes = [AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


# ─────────────────────────────────────────────
# LOGIN  (unified — employee_id + password → OTP → JWT)
# ─────────────────────────────────────────────

class LoginView(APIView):
    permission_classes = [AllowAny]

    @staticmethod
    def get_client_ip(request):
        x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
        if x_forwarded_for:
            return x_forwarded_for.split(",")[0]
        return request.META.get("REMOTE_ADDR")

    def post(self, request):
        employee_id = request.data.get("employee_id", "").strip()
        email = request.data.get("email", "").strip().lower()
        password = request.data.get("password", "")

        if not employee_id or not email or not password:
            return Response(
                {"error": "employee_id, email and password are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_role = UserRole.objects.select_related("user", "role").get(
                employee_id=employee_id
            )
        except UserRole.DoesNotExist:
            return Response(
                {"error": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        user = user_role.user

        if user.email.lower() != email:
            return Response(
                {"error": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if not user.check_password(password):
            return Response(
                {"error": "Invalid credentials."},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        send_otp_email(user.email, "LOGIN")

        ip = self.get_client_ip(request)
        device = request.META.get("HTTP_USER_AGENT", "")

        LoginLogs.objects.create(
            user=user,
            ip_address=ip,
            device_info=device,
            login_status=False,
        )

        return Response(
            {
                "message": "OTP sent to registered email.",
                "employee_id": employee_id,
                "email": user.email,
                "role": user_role.role.name,
            },
            status=status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────
# VERIFY LOGIN OTP
# ─────────────────────────────────────────────

class VerifyLoginOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        otp_code = request.data.get("otp", "").strip()

        if not otp_code:
            return Response({"error": "OTP is required."}, status=400)

        otp = (
            OTP.objects.filter(otp_code=otp_code, is_used=False)
            .order_by("-created_at")
            .first()
        )

        if not otp:
            return Response({"error": "Invalid OTP."}, status=400)

        if otp.is_expired():
            return Response({"error": "OTP has expired."}, status=400)

        user = User.objects.filter(email=otp.email).first()
        if not user:
            return Response({"error": "User not found."}, status=404)

        try:
            user_role = UserRole.objects.select_related("role").get(user=user)
        except UserRole.DoesNotExist:
            return Response({"error": "User role not assigned."}, status=400)

        otp.is_used = True
        otp.save()

        # Mark login log as successful
        log = LoginLogs.objects.filter(user=user, login_status=False).last()
        if log:
            log.login_status = True
            log.save()

        refresh = RefreshToken.for_user(user)

        return Response(
            {
                "message": "Login successful.",
                "employee_id": user_role.employee_id,
                "role": user_role.role.name,
                "force_change_password": user_role.is_first_login,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────
# LOGOUT
# ─────────────────────────────────────────────

class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get("refresh_token")
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()

            log = LoginLogs.objects.filter(
                user=request.user, login_status=True
            ).last()
            if log:
                log.logout_time = now()
                log.save()

            return Response(
                {"message": "Logged out successfully."},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ─────────────────────────────────────────────
# FORCE CHANGE PASSWORD  (first login)
# ─────────────────────────────────────────────

class ForceChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        new_password = request.data.get("new_password", "")
        confirm_password = request.data.get("confirm_password", "")

        if not new_password or not confirm_password:
            return Response(
                {"error": "Both password fields are required."}, status=400
            )

        if new_password != confirm_password:
            return Response({"error": "Passwords do not match."}, status=400)

        request.user.set_password(new_password)
        request.user.save()

        try:
            user_role = UserRole.objects.get(user=request.user)
            user_role.is_first_login = False
            user_role.save()
        except UserRole.DoesNotExist:
            pass

        return Response({"message": "Password changed successfully."})


# ─────────────────────────────────────────────
# FORGOT PASSWORD / RESET PASSWORD
# ─────────────────────────────────────────────

class ForgotPasswordOTPView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ForgotPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        email = serializer.validated_data["email"]

        if not User.objects.filter(email=email).exists():
            return Response({"error": "User not found."}, status=404)

        send_otp_email(email, "RESET_PASSWORD")
        return Response({"message": "OTP sent for password reset."})


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = ResetPasswordSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        data = serializer.validated_data

        otp = OTP.objects.filter(
            email=data["email"],
            otp_code=data["otp"],
            purpose="RESET_PASSWORD",
            is_used=False,
        ).last()

        if not otp:
            return Response({"error": "Invalid OTP."}, status=400)

        if otp.is_expired():
            return Response({"error": "OTP has expired."}, status=400)

        user = User.objects.filter(email=data["email"]).first()
        if not user:
            return Response({"error": "User not found."}, status=404)

        user.set_password(data["new_password"])
        user.save()
        otp.is_used = True
        otp.save()

        return Response({"message": "Password reset successful."})


# ─────────────────────────────────────────────
# ADMIN: CREATE USER
# Only admin role can create users.
# Admin can create other admins.
# ─────────────────────────────────────────────

class AdminCreateUserView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        # ── Permission check ──────────────────────────────────────────────────
        if not is_admin(request.user):
            return Response(
                {"error": "Only admins can create users."},
                status=status.HTTP_403_FORBIDDEN,
            )

        username = request.data.get("username", "").strip()
        email = request.data.get("email", "").strip().lower()
        role_name = request.data.get("role", "").strip()
        first_name = request.data.get("f_name", "").strip()
        last_name = request.data.get("l_name", "").strip()

        if not username or not email or not role_name:
            return Response(
                {"error": "username, email, and role are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Validate role name
        valid_roles = [r[0] for r in Role.ROLE_CHOICES]
        if role_name not in valid_roles:
            return Response(
                {"error": f"Invalid role. Choose from: {', '.join(valid_roles)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {"error": "Username already taken."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(email=email).exists():
            return Response(
                {"error": "Email already registered."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        password = generate_random_password()
        role, _ = Role.objects.get_or_create(name=role_name)

        # ADM prefix for admins, EMP for everyone else
        if role_name == "admin":
            employee_id = generate_admin_id()
        else:
            employee_id = generate_employee_id()

        user = User.objects.create_user(
            username=username,
            first_name=first_name,
            last_name=last_name,
            email=email,
            password=password,
        )

        user_role = UserRole.objects.create(
            employee_id=employee_id,
            user=user,
            role=role,
            is_first_login=True,
        )

        send_mail(
            subject="Your WMS Account Credentials",
            message=(
                f"Hello {first_name or username},\n\n"
                f"Your account has been created.\n\n"
                f"Employee ID : {employee_id}\n"
                f"Password    : {password}\n"
                f"Role        : {role.get_name_display()}\n\n"
                f"You will be prompted to change your password on first login.\n\n"
                f"- WMS Team"
            ),
            from_email=None,
            recipient_list=[email],
        )

        return Response(
            {
                "message": "User created and credentials sent via email.",
                "employee_id": employee_id,
                "role": role_name,
            },
            status=status.HTTP_201_CREATED,
        )


# ─────────────────────────────────────────────
# ADMIN: LIST EMPLOYEES
# ─────────────────────────────────────────────

class ListEmployeeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        employees = UserRole.objects.select_related("user", "role").all()
        data = [
            {
                "id": emp.user.id,
                "employee_id": emp.employee_id,
                "username": emp.user.username,
                "first_name": emp.user.first_name,
                "last_name": emp.user.last_name,
                "email": emp.user.email,
                "role": emp.role.name,
                "role_display": emp.role.get_name_display(),
                "is_first_login": emp.is_first_login,
            }
            for emp in employees
        ]
        return Response(data, status=status.HTTP_200_OK)


# ─────────────────────────────────────────────
# ADMIN: UPDATE EMPLOYEE
# ─────────────────────────────────────────────

class UpdateEmployeeView(APIView):
    permission_classes = [IsAuthenticated]

    def put(self, request, employee_id):
        if not is_admin(request.user):
            return Response(
                {"error": "Only admins can update users."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            user_role = UserRole.objects.select_related("user", "role").get(
                employee_id=employee_id
            )
        except UserRole.DoesNotExist:
            return Response({"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        user = user_role.user
        user.username = request.data.get("username", user.username)
        user.email = request.data.get("email", user.email)
        user.first_name = request.data.get("f_name", user.first_name)
        user.last_name = request.data.get("l_name", user.last_name)
        user.save()

        new_role_name = request.data.get("role")
        if new_role_name:
            valid_roles = [r[0] for r in Role.ROLE_CHOICES]
            if new_role_name not in valid_roles:
                return Response(
                    {"error": f"Invalid role. Choose from: {', '.join(valid_roles)}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            role_obj, _ = Role.objects.get_or_create(name=new_role_name)
            user_role.role = role_obj
            user_role.save()

        return Response(
            {
                "message": f"Employee {employee_id} updated successfully.",
                "employee_id": employee_id,
            },
            status=status.HTTP_200_OK,
        )


# ─────────────────────────────────────────────
# DELETE USER
# ── Admins CANNOT be deleted via API (ever).
# ── Only admins can delete non-admin users.
# ── An admin cannot delete themselves.
# ─────────────────────────────────────────────

class DeleteUserView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, employee_id):
        # Only admins can perform deletions
        if not is_admin(request.user):
            return Response(
                {"error": "Only admins can delete users."},
                status=status.HTTP_403_FORBIDDEN,
            )

        try:
            target_user_role = UserRole.objects.select_related("user", "role").get(
                employee_id=employee_id
            )
        except UserRole.DoesNotExist:
            return Response({"error": "Employee not found."}, status=status.HTTP_404_NOT_FOUND)

        # Block: cannot delete any admin account
        if target_user_role.role.name == "admin":
            return Response(
                {"error": "Admin accounts cannot be deleted."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Block: cannot delete yourself
        if target_user_role.user == request.user:
            return Response(
                {"error": "You cannot delete your own account."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_user_role.user.delete()
        return Response(
            {"message": "User deleted successfully."},
            status=status.HTTP_200_OK,
        )