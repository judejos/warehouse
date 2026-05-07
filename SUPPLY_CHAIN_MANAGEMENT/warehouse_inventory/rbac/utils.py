from django.contrib.auth.models import User
from .models import Notification, Role, UserRole

def notify_role(sender, recipient_role_name, notification_type, title, message, redirect_url=None):
    """
    Backend helper to send a notification to all users of a specific role.
    """
    try:
        notification = Notification.objects.create(
            sender=sender,
            recipient_role=recipient_role_name,
            notification_type=notification_type,
            title=title,
            message=message,
            redirect_url=redirect_url
        )
        return notification
    except Exception as e:
        print(f"Failed to create notification: {e}")
        return None

def get_user_role_name(user):
    try:
        user_role = UserRole.objects.get(user=user)
        return user_role.role.role_name
    except UserRole.DoesNotExist:
        return "unknown"
