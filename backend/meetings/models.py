"""
Models for meetings and action items.
Maps directly to the PRD schema:
  - Meeting Table: ID, user_id, meeting_url, title, date, full_transcript, final_summary
  - ActionItem Table: ID, meeting_id, assigned_speaker, task_description, deadline, is_completed
"""

from django.conf import settings
from django.db import models


class Meeting(models.Model):
    """
    Represents a recorded meeting session.
    """

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        BOT_JOINING = "bot_joining", "Bot Joining"
        IN_PROGRESS = "in_progress", "In Progress"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="meetings",
    )
    meeting_url = models.URLField("Meeting URL", max_length=500)
    title = models.CharField("Meeting Title", max_length=255, blank=True, default="")
    date = models.DateTimeField("Meeting Date", auto_now_add=True)
    status = models.CharField(
        "Status",
        max_length=20,
        choices=Status.choices,
        default=Status.PENDING,
    )

    # Recall.ai bot tracking
    bot_id = models.CharField("Recall Bot ID", max_length=255, blank=True, default="")

    # Transcription & LLM outputs
    full_transcript = models.TextField("Full Transcript", blank=True, default="")
    final_summary = models.TextField("Final Summary", blank=True, default="")

    # Customization Settings
    target_topics = models.JSONField("Target Topics", default=list, blank=True)
    live_language = models.CharField("Live Language", max_length=50, default="English")
    summary_language = models.CharField("Summary Language", max_length=50, default="English")

    # Transcription mode chosen when meeting was created:
    #   'auto'  — Azure uses its default detection (no special config)
    #   'skip'  — Skip first 8 seconds so Azure warms up on actual speech
    #   'hints' — Inject user's AI-generated phrase hint table
    transcription_mode = models.CharField(
        "Transcription Mode",
        max_length=10,
        default="auto",
        choices=[
            ("auto",  "Auto (default)"),
            ("skip",  "Auto-detect (skip 8s warmup)"),
            ("hints", "Use preferred language + AI hints"),
        ],
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "meetings"
        ordering = ["-date"]

    def __str__(self):
        return f"{self.title or 'Untitled'} — {self.date:%Y-%m-%d %H:%M}"


class ActionItem(models.Model):
    """
    An extracted action item from a meeting transcript.
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="action_items",
    )
    assigned_speaker = models.CharField("Assignee", max_length=150)
    task_description = models.TextField("Task (English)")
    deadline = models.CharField("Deadline", max_length=100, blank=True, null=True)
    is_completed = models.BooleanField("Completed", default=False)

    # Link to the actual Speaker record for disambiguation
    speaker = models.ForeignKey(
        "Speaker",
        on_delete=models.SET_NULL,
        related_name="action_items",
        null=True,
        blank=True,
    )

    # Notification tracking
    notification_sent = models.BooleanField("Notification Sent", default=False)
    notification_sent_at = models.DateTimeField("Notification Sent At", null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "action_items"
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.assigned_speaker}] {self.task_description[:60]}"


class TranscriptChunk(models.Model):
    """
    A 3-minute transcript chunk sent to the LLM for processing.
    Stores both the raw multilingual text and the structured LLM output.
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="transcript_chunks",
    )
    chunk_index = models.PositiveIntegerField("Chunk #")
    raw_text = models.TextField("Raw Transcript Text")
    processed_json = models.JSONField("LLM Output JSON", blank=True, null=True)
    timestamp_start = models.FloatField("Start Time (seconds)", default=0)
    timestamp_end = models.FloatField("End Time (seconds)", default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "transcript_chunks"
        ordering = ["chunk_index"]
        unique_together = ["meeting", "chunk_index"]

    def __str__(self):
        return f"Chunk {self.chunk_index} — Meeting {self.meeting_id}"


"""
ADDITION TO meetings/models.py
-------------------------------
Add these three new models to your existing models.py file,
below the existing TranscriptChunk model.

These power the LIVE per-speaker tracking system.
"""

# ─── Paste everything below into your existing meetings/models.py ───


class Speaker(models.Model):
    """
    A participant identified in a live meeting.
    Created automatically when Recall.ai sends us their first transcript segment.
    Updated in real time as they speak.
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="speakers",
    )

    # Recall.ai identifies participants by a participant_id string
    recall_participant_id = models.CharField(
        "Recall Participant ID", max_length=255, blank=True, default=""
    )
    name = models.CharField("Display Name", max_length=150)
    email = models.EmailField("Email", blank=True, default="")

    # Live stats — updated every time a transcript segment arrives
    is_speaking = models.BooleanField("Currently Speaking", default=False)
    talk_time_seconds = models.PositiveIntegerField("Total Talk Time (s)", default=0)
    word_count = models.PositiveIntegerField("Total Words Spoken", default=0)

    # Set by AI analysis every 3 minutes
    performance_score = models.FloatField(
        "Performance Score (0-100)", null=True, blank=True
    )
    sentiment = models.CharField(
        "Sentiment",
        max_length=20,
        choices=[
            ("positive", "Positive"),
            ("neutral", "Neutral"),
            ("negative", "Negative"),
        ],
        null=True,
        blank=True,
    )
    last_quote = models.TextField("Last Notable Quote", blank=True, default="")

    joined_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "speakers"
        unique_together = ["meeting", "recall_participant_id"]
        ordering = ["-word_count"]

    def __str__(self):
        return f"{self.name} — Meeting {self.meeting_id}"


class LiveTranscriptSegment(models.Model):
    """
    A single real-time transcript segment received from Recall.ai webhook.
    These arrive every few seconds during the live meeting.

    Think of these as the raw building blocks — every 3 minutes,
    all segments for a speaker get flushed to Gemini for analysis.
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="live_segments",
    )
    speaker = models.ForeignKey(
        Speaker,
        on_delete=models.CASCADE,
        related_name="segments",
        null=True,
        blank=True,
    )

    text = models.TextField("Transcript Text")
    start_time = models.FloatField("Start Time (seconds from meeting start)", default=0)
    end_time = models.FloatField("End Time (seconds)", default=0)
    is_final = models.BooleanField("Is Final Segment", default=True)

    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "live_transcript_segments"
        ordering = ["start_time"]

    def __str__(self):
        return f"[{self.speaker.name if self.speaker else 'Unknown'}] {self.text[:60]}"


class SpeakerAnalysis(models.Model):
    """
    AI analysis result for one speaker's 3-minute window.
    Created by Gemini every time a speaker's buffer is flushed.
    Pushed to the dashboard via WebSocket immediately after creation.
    """

    meeting = models.ForeignKey(
        Meeting,
        on_delete=models.CASCADE,
        related_name="speaker_analyses",
    )
    speaker = models.ForeignKey(
        Speaker,
        on_delete=models.CASCADE,
        related_name="analyses",
    )

    # Window this analysis covers
    window_start = models.FloatField("Window Start (seconds)", default=0)
    window_end = models.FloatField("Window End (seconds)", default=0)

    # AI outputs
    sentiment = models.CharField(
        max_length=20,
        choices=[
            ("positive", "Positive"),
            ("neutral", "Neutral"),
            ("negative", "Negative"),
        ],
        default="neutral",
    )
    performance_score = models.FloatField(
        "Performance Score (0-100)", null=True, blank=True
    )
    summary = models.TextField("Window Summary", blank=True, default="")
    key_points = models.JSONField("Key Points", default=list)
    topic_coverage = models.JSONField("Topic Coverage", default=dict)
    one_line_quote = models.TextField("Notable Quote", blank=True, default="")
    engagement_signals = models.JSONField("Engagement Signals", default=dict)

    # Full raw response from Gemini (for debugging)
    raw_response = models.JSONField("Raw LLM Response", null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "speaker_analyses"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.speaker.name} — score={self.performance_score} — Meeting {self.meeting_id}"


class TeamDirectory(models.Model):
    """
    Maps participant names/emails to notification channels.
    The meeting host's organization maintains this directory so that
    action items can be automatically routed after meetings.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="team_directory",
        help_text="The app user who owns this directory entry",
    )
    name = models.CharField("Display Name", max_length=150)
    email = models.EmailField("Email Address", blank=True, default="")
    slack_id = models.CharField("Slack User ID", max_length=50, blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "team_directory"
        unique_together = ["user", "email"]
        ordering = ["name"]

    def __str__(self):
        return f"{self.name} <{self.email}> (slack: {self.slack_id or '—'})"
