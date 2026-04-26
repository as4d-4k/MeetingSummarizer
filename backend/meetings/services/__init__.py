"""
Service layer for the meetings app.

Contains business logic for:
  - Recall.ai bot management
  - Audio transcription (OpenAI Whisper)
  - LLM-based summarization & action-item extraction (LangChain + GPT-4o)
"""

from .recall_service import RecallService, RecallServiceError
from .transcription_service import TranscriptionService
from .llm_service import LLMService, LLMServiceError

__all__ = ["RecallService", "RecallServiceError", "TranscriptionService", "LLMService", "LLMServiceError"]
