"""
Audio transcription service using OpenAI Whisper API.

Handles:
  - Transcribing audio files (supports Urdu/English code-switching)
  - Converting Recall.ai transcript segments into a unified text format
"""

import logging
from pathlib import Path

from openai import OpenAI
from django.conf import settings

logger = logging.getLogger(__name__)


class TranscriptionServiceError(Exception):
    """Raised when transcription fails."""
    pass


class TranscriptionService:
    """
    Transcription service using OpenAI Whisper API.

    Supports two modes:
      1. Audio file transcription (for recordings downloaded from Recall.ai)
      2. Raw transcript assembly (for Recall.ai's built-in transcription)
    """

    def __init__(self):
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise TranscriptionServiceError("OPENAI_API_KEY is not configured.")
        self.client = OpenAI(api_key=api_key)

    # ──────────────────────────────────────────────
    # Mode 1: Transcribe audio via Whisper API
    # ──────────────────────────────────────────────
    def transcribe_audio(self, audio_file_path: str) -> str:
        """
        Transcribe an audio file using OpenAI Whisper API.

        Optimized for Urdu/English code-switched meetings:
        - Uses a prompt hint to guide the model toward Urdu+English
        - Returns the full transcript as a single string

        Args:
            audio_file_path: Path to the audio file (mp3, mp4, wav, webm, etc.)

        Returns:
            Full transcript text.
        """
        file_path = Path(audio_file_path)
        if not file_path.exists():
            raise TranscriptionServiceError(f"Audio file not found: {audio_file_path}")

        logger.info("Transcribing audio file: %s (%.1f MB)", file_path.name, file_path.stat().st_size / 1e6)

        try:
            with open(file_path, "rb") as audio_file:
                response = self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    # Prompt helps Whisper handle code-switching
                    prompt=(
                        "This is a meeting with speakers who mix Urdu and English. "
                        "Transcribe exactly what is said, preserving both Urdu and English words. "
                        "Use Urdu script for Urdu words and Latin script for English words."
                    ),
                    response_format="text",
                )

            transcript = response.strip() if isinstance(response, str) else response.text.strip()
            logger.info("Transcription complete: %d characters", len(transcript))
            return transcript

        except Exception as exc:
            logger.error("Whisper transcription failed: %s", exc)
            raise TranscriptionServiceError(f"Whisper transcription failed: {exc}") from exc

    # ──────────────────────────────────────────────
    # Mode 2: Assemble from Recall.ai transcript
    # ──────────────────────────────────────────────
    def assemble_recall_transcript(self, transcript_segments: list[dict]) -> str:
        """
        Convert Recall.ai transcript segments into a unified text.

        Recall.ai returns segments like:
            [{"speaker": "User 1", "words": [{"text": "hello", "start_time": 0.5}, ...]}]

        This method assembles them into a speaker-labelled transcript:
            Speaker 1: hello how are you
            Speaker 2: I'm fine thanks

        Args:
            transcript_segments: List of transcript segments from Recall.ai.

        Returns:
            Formatted transcript string with speaker labels.
        """
        if not transcript_segments:
            logger.warning("Empty transcript segments received")
            return ""

        lines = []
        for segment in transcript_segments:
            speaker = segment.get("speaker", "Unknown Speaker")
            words = segment.get("words", [])
            text = " ".join(w.get("text", "") for w in words).strip()
            if text:
                lines.append(f"{speaker}: {text}")

        transcript = "\n".join(lines)
        logger.info("Assembled transcript: %d segments → %d characters", len(transcript_segments), len(transcript))
        return transcript

    # ──────────────────────────────────────────────
    # Chunking
    # ──────────────────────────────────────────────
    def chunk_transcript(
        self,
        transcript: str,
        chunk_duration_seconds: float = 180.0,
        total_duration_seconds: float | None = None,
    ) -> list[dict]:
        """
        Split a transcript into time-based chunks for LLM processing.

        If we don't have timing info, we split by character count proportionally
        based on the assumption that speech is ~150 words per minute.

        Args:
            transcript: The full transcript text.
            chunk_duration_seconds: Target chunk duration (default 3 minutes).
            total_duration_seconds: Total meeting duration in seconds (if known).

        Returns:
            List of dicts: [{"chunk_index": 0, "text": "...", "start": 0.0, "end": 180.0}, ...]
        """
        if not transcript.strip():
            return []

        # If we don't know total duration, estimate from word count
        # (~150 words/min = 2.5 words/sec)
        words = transcript.split()
        if total_duration_seconds is None:
            total_duration_seconds = max(len(words) / 2.5, chunk_duration_seconds)

        # Calculate number of chunks
        num_chunks = max(1, round(total_duration_seconds / chunk_duration_seconds))

        # Split text roughly evenly
        chars_per_chunk = max(1, len(transcript) // num_chunks)
        chunks = []

        for i in range(num_chunks):
            start_char = i * chars_per_chunk
            end_char = (i + 1) * chars_per_chunk if i < num_chunks - 1 else len(transcript)

            # Try to split on a newline boundary to avoid cutting mid-sentence
            if end_char < len(transcript):
                newline_pos = transcript.rfind("\n", start_char, end_char + 200)
                if newline_pos > start_char:
                    end_char = newline_pos + 1

            chunk_text = transcript[start_char:end_char].strip()
            if chunk_text:
                time_start = (i * chunk_duration_seconds)
                time_end = min(((i + 1) * chunk_duration_seconds), total_duration_seconds)
                chunks.append({
                    "chunk_index": len(chunks),
                    "text": chunk_text,
                    "start": round(time_start, 1),
                    "end": round(time_end, 1),
                })

        logger.info("Transcript chunked: %d chunks from %d chars", len(chunks), len(transcript))
        return chunks
