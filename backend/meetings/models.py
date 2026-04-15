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
    bot_id = models.CharField(
        "Recall Bot ID", max_length=255, blank=True, default=""
    )

    # Transcription & LLM outputs
    full_transcript = models.TextField("Full Transcript", blank=True, default="")
    final_summary = models.TextField("Final Summary", blank=True, default="")

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
    deadline = models.CharField(
        "Deadline", max_length=100, blank=True, null=True
    )
    is_completed = models.BooleanField("Completed", default=False)

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
    processed_json = models.JSONField(
        "LLM Output JSON", blank=True, null=True
    )
    timestamp_start = models.FloatField("Start Time (seconds)", default=0)
    timestamp_end = models.FloatField("End Time (seconds)", default=0)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "transcript_chunks"
        ordering = ["chunk_index"]
        unique_together = ["meeting", "chunk_index"]

    def __str__(self):
        return f"Chunk {self.chunk_index} — Meeting {self.meeting_id}"
