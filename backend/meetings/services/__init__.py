"""
Service layer for the meetings app.

Contains business logic for:
  - Recall.ai bot management
  - Audio transcription (OpenAI Whisper)
  - LLM-based summarization & action-item extraction (LangChain + GPT-4o)
  - Action item notifications (Email + Slack)
"""

from .recall_service import RecallService, RecallServiceError
from .transcription_service import TranscriptionService
from .llm_service import LLMService, LLMServiceError
from .notification_service import NotificationService, NotificationServiceError

__all__ = [
    "RecallService", "RecallServiceError",
    "TranscriptionService",
    "LLMService", "LLMServiceError",
    "NotificationService", "NotificationServiceError",
]
