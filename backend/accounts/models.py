"""
Custom User model for the Meeting Summarizer.
Uses email as the primary login field instead of username.
"""

from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """
    Custom user model — email-based authentication.
    Maps to PRD: User Table (ID, email, password_hash, created_at).
    Django's AbstractUser already provides password hashing and created_at (date_joined).
    """

    email = models.EmailField("email address", unique=True)

    # Use email for login instead of username
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]  # username still required by createsuperuser

    class Meta:
        db_table = "users"
        ordering = ["-date_joined"]

    def __str__(self):
        return self.email
