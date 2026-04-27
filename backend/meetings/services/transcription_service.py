"""
Audio transcription service.

Supports two providers (auto-selects based on available API keys):
  1. Google Gemini 2.5 Flash (free tier) — preferred
  2. OpenAI Whisper (paid)

Also handles:
  - Converting Recall.ai transcript segments into a unified text format
  - Chunking transcripts into processable segments
"""

import logging
from pathlib import Path

from django.conf import settings

logger = logging.getLogger(__name__)


class TranscriptionServiceError(Exception):
    """Raised when transcription fails."""
    pass


class TranscriptionService:
    """
    Transcription service with auto-provider selection.

    Supports two modes:
      1. Audio file transcription (for recordings downloaded from Recall.ai)
      2. Raw transcript assembly (for Recall.ai's built-in transcription)
    """

    def __init__(self):
        self.provider = self._detect_provider()

    def _detect_provider(self) -> str:
        """Detect which transcription provider to use."""
        if getattr(settings, 'GOOGLE_API_KEY', ''):
            return 'gemini'
        if getattr(settings, 'OPENAI_API_KEY', ''):
            return 'openai'
        raise TranscriptionServiceError("No API key configured. Set GOOGLE_API_KEY or OPENAI_API_KEY.")

    # ──────────────────────────────────────────────
    # Mode 1: Transcribe audio file
    # ──────────────────────────────────────────────
    def transcribe_audio(self, audio_file_path: str) -> str:
        """
        Transcribe an audio file using the best available provider.

        Optimized for Urdu/English code-switched meetings.

        Args:
            audio_file_path: Path to the audio file (mp3, mp4, wav, webm, etc.)

        Returns:
            Full transcript text.
        """
        file_path = Path(audio_file_path)
        if not file_path.exists():
            raise TranscriptionServiceError(f"Audio file not found: {audio_file_path}")

        logger.info("Transcribing audio file: %s (%.1f MB) using %s",
                     file_path.name, file_path.stat().st_size / 1e6, self.provider)

        if self.provider == 'gemini':
            return self._transcribe_with_gemini(file_path)
        else:
            return self._transcribe_with_whisper(file_path)

    def _transcribe_with_gemini(self, file_path: Path) -> str:
        """Transcribe using Google Gemini 2.5 Flash (handles audio natively)."""
        import time
        try:
            from google import genai

            client = genai.Client(api_key=settings.GOOGLE_API_KEY)

            # Upload the audio file to Gemini
            logger.info("Uploading audio to Gemini...")
            uploaded_file = client.files.upload(file=file_path)

            # Wait for file to be processed
            while uploaded_file.state == "PROCESSING":
                time.sleep(2)
                uploaded_file = client.files.get(name=uploaded_file.name)

            if uploaded_file.state != "ACTIVE":
                raise TranscriptionServiceError(f"File upload failed: state={uploaded_file.state}")

            logger.info("Audio uploaded, requesting transcription...")

            # Retry with exponential backoff for 503/429 errors
            max_retries = 3
            backoff_times = [10, 30, 60]

            for attempt in range(max_retries + 1):
                try:
                    response = client.models.generate_content(
                        model="gemini-2.5-flash",
                        contents=[
                            uploaded_file,
                            "Transcribe this meeting audio EXACTLY as spoken. "
                            "The speakers mix Urdu and English (code-switching). "
                            "Write Urdu words in Roman Urdu (Latin script) and English words normally. "
                            "Format as a plain transcript with speaker labels if possible "
                            "(e.g., 'Speaker 1: ...', 'Speaker 2: ...'). "
                            "Do NOT summarize — provide the full word-for-word transcription."
                        ],
                    )

                    transcript = response.text.strip()
                    logger.info("Gemini transcription complete: %d characters", len(transcript))

                    # Clean up uploaded file
                    try:
                        client.files.delete(name=uploaded_file.name)
                    except Exception:
                        pass

                    return transcript

                except Exception as api_err:
                    err_str = str(api_err)
                    if ("503" in err_str or "429" in err_str or "UNAVAILABLE" in err_str or "RESOURCE_EXHAUSTED" in err_str) and attempt < max_retries:
                        wait_time = backoff_times[attempt]
                        logger.warning("Gemini API overloaded (attempt %d/%d), retrying in %ds: %s",
                                       attempt + 1, max_retries + 1, wait_time, api_err)
                        time.sleep(wait_time)
                    else:
                        # Clean up uploaded file before raising
                        try:
                            client.files.delete(name=uploaded_file.name)
                        except Exception:
                            pass
                        raise

        except Exception as exc:
            logger.error("Gemini transcription failed: %s", exc)
            raise TranscriptionServiceError(f"Gemini transcription failed: {exc}") from exc

    def _transcribe_with_whisper(self, file_path: Path) -> str:
        """Transcribe using OpenAI Whisper API."""
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)

            with open(file_path, "rb") as audio_file:
                response = client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    prompt=(
                        "This is a meeting with speakers who mix Urdu and English. "
                        "Transcribe exactly what is said, preserving both Urdu and English words. "
                        "Use Urdu script for Urdu words and Latin script for English words."
                    ),
                    response_format="text",
                )

            transcript = response.strip() if isinstance(response, str) else response.text.strip()
            logger.info("Whisper transcription complete: %d characters", len(transcript))
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
