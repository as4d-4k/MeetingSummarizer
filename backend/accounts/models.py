"""
Custom User model + UserLanguageProfile for Meeting Summarizer.
Uses email as the primary login field instead of username.
"""

import random
import string
from django.contrib.auth.models import AbstractUser
from django.db import models


def generate_org_key():
    """Generate a unique 4-character alphanumeric key for an admin/organization."""
    return ''.join(random.choices(string.ascii_letters + string.digits, k=4))


class User(AbstractUser):
    """
    Custom user model — email-based authentication.
    Maps to PRD: User Table (ID, email, password_hash, created_at).
    Django's AbstractUser already provides password hashing and created_at (date_joined).
    """

    email = models.EmailField("email address", unique=True)

    # Unique organization key — appended to every team member's login key
    org_key = models.CharField(
        "Organization Key",
        max_length=4,
        unique=True,
        blank=True,
        default=generate_org_key,
    )

    slack_id = models.CharField("Slack ID", max_length=50, blank=True, default="")

    # Use email for login instead of username
    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]  # username still required by createsuperuser

    class Meta:
        db_table = "users"
        ordering = ["-date_joined"]

    def __str__(self):
        return self.email


class UserLanguageProfile(models.Model):
    """
    Stores a user's language + industry preferences and
    the AI-generated speech hint table used to warm up Azure Speech.
    One-to-one with User (created on first save).
    """

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="language_profile",
    )

    # Language preferences (BCP-47 codes)
    primary_language   = models.CharField("Primary Language Code",   max_length=10, default="en-US")
    secondary_language = models.CharField("Secondary Language Code", max_length=10, default="en-US")

    # Industry domain
    industry = models.CharField(
        "Industry",
        max_length=50,
        default="general",
        choices=[
            ("technology",  "Technology"),
            ("finance",     "Finance"),
            ("medical",     "Healthcare"),
            ("education",   "Education"),
            ("legal",       "Legal"),
            ("general",     "General"),
        ],
    )

    # AI-generated phrase hints stored as a JSON list of strings
    # e.g. ["یہ ٹھیک ہے", "project deadline", "milestone", ...]
    hint_phrases = models.JSONField("Hint Phrases", default=list)

    # Metadata
    hints_generated_at = models.DateTimeField("Hints Generated At", null=True, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_language_profiles"

    def __str__(self):
        return f"{self.user.email} — {self.primary_language}/{self.industry}"
