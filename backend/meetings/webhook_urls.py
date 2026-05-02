"""
meetings/webhook_urls.py  — FULL REPLACEMENT
----------------------------------------------
Added: recall_transcript_webhook URL for live transcript segments.
"""

from django.urls import path
from .views import recall_webhook, recall_transcript_webhook

urlpatterns = [
    # Bot status changes (joining, recording, done, failed)
    path("recall/", recall_webhook, name="recall-webhook"),
    # ── NEW: Live transcript segments during meeting ──────────────────────────
    # Recall.ai posts here every few seconds as speakers talk
    path(
        "recall/transcript/",
        recall_transcript_webhook,
        name="recall-transcript-webhook",
    ),
]
