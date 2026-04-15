"""
Admin configuration for user accounts.
"""

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth import get_user_model

User = get_user_model()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    """Custom admin for the User model."""

    list_display = ["email", "username", "is_staff", "date_joined"]
    list_filter = ["is_staff", "is_superuser", "is_active"]
    search_fields = ["email", "username"]
    ordering = ["-date_joined"]
