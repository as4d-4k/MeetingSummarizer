"""
meetings/transcript_buffer.py
------------------------------
In-memory per-speaker transcript buffer.

How it works:
  1. Every real-time transcript segment from Recall.ai webhook is appended here.
  2. A Celery beat task (flush_speaker_buffers) runs every 3 minutes and flushes
     each speaker's buffer — sending the accumulated text to Gemini for analysis.
  3. The analysis result is saved to DB and broadcast to the admin dashboard via WebSocket.

This module is a simple thread-safe singleton. It lives in memory for the duration
of the Django/Celery process. Redis is used as backup for cross-process sharing.
"""

import threading
import time
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class SpeakerBuffer:
    """
    Holds accumulated transcript segments for one speaker in one meeting.
    """

    meeting_id: int
    speaker_id: int
    speaker_name: str
    segments: list = field(default_factory=list)
    window_start: float = field(default_factory=time.time)
    total_words: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock)

    def append(self, text: str, start_t: float, end_t: float):
        with self.lock:
            self.segments.append(
                {
                    "text": text,
                    "start": start_t,
                    "end": end_t,
                }
            )
            self.total_words += len(text.split())

    def flush(self) -> tuple:
        """
        Drain all buffered segments and return them.
        Returns: (combined_text, window_start, window_end)
        """
        with self.lock:
            if not self.segments:
                return "", self.window_start, time.time()

            combined_text = " ".join(s["text"] for s in self.segments)
            ws = self.window_start
            we = self.segments[-1]["end"] if self.segments else time.time()

            # Reset buffer
            self.segments = []
            self.window_start = time.time()
            self.total_words = 0

            return combined_text, ws, we

    @property
    def is_empty(self) -> bool:
        with self.lock:
            return len(self.segments) == 0

    @property
    def word_count(self) -> int:
        with self.lock:
            return self.total_words


class TranscriptBufferManager:
    """
    Global singleton that holds all active speaker buffers.

    Key: (meeting_id, speaker_id)  →  Value: SpeakerBuffer
    """

    def __init__(self):
        self._buffers: dict[tuple, SpeakerBuffer] = {}
        self._lock = threading.Lock()
        # Track which meetings are currently live
        self._active_meetings: set[int] = set()

    def activate_meeting(self, meeting_id: int):
        with self._lock:
            self._active_meetings.add(meeting_id)
        logger.info("BufferManager: meeting %d activated", meeting_id)

    def deactivate_meeting(self, meeting_id: int):
        with self._lock:
            self._active_meetings.discard(meeting_id)
            # Remove all buffers for this meeting
            keys_to_remove = [k for k in self._buffers if k[0] == meeting_id]
            for k in keys_to_remove:
                del self._buffers[k]
        logger.info(
            "BufferManager: meeting %d deactivated, %d buffers removed",
            meeting_id,
            len(keys_to_remove),
        )

    def is_active(self, meeting_id: int) -> bool:
        with self._lock:
            return meeting_id in self._active_meetings

    def get_or_create_buffer(
        self, meeting_id: int, speaker_id: int, speaker_name: str
    ) -> SpeakerBuffer:
        key = (meeting_id, speaker_id)
        with self._lock:
            if key not in self._buffers:
                self._buffers[key] = SpeakerBuffer(
                    meeting_id=meeting_id,
                    speaker_id=speaker_id,
                    speaker_name=speaker_name,
                )
                logger.info(
                    "BufferManager: new buffer for speaker '%s' in meeting %d",
                    speaker_name,
                    meeting_id,
                )
            return self._buffers[key]

    def append(
        self,
        meeting_id: int,
        speaker_id: int,
        speaker_name: str,
        text: str,
        start_t: float,
        end_t: float,
    ):
        buf = self.get_or_create_buffer(meeting_id, speaker_id, speaker_name)
        buf.append(text, start_t, end_t)

    def get_all_buffers_for_meeting(self, meeting_id: int) -> list[SpeakerBuffer]:
        with self._lock:
            return [buf for (mid, _), buf in self._buffers.items() if mid == meeting_id]

    def get_active_meeting_ids(self) -> list[int]:
        with self._lock:
            return list(self._active_meetings)

    def flush_speaker(self, meeting_id: int, speaker_id: int) -> Optional[tuple]:
        """
        Flush one speaker's buffer.
        Returns (text, window_start, window_end) or None if buffer was empty.
        """
        key = (meeting_id, speaker_id)
        with self._lock:
            buf = self._buffers.get(key)
        if buf is None or buf.is_empty:
            return None
        return buf.flush()

    def get_stats(self) -> dict:
        with self._lock:
            return {
                "active_meetings": list(self._active_meetings),
                "total_buffers": len(self._buffers),
                "buffers": [
                    {
                        "meeting_id": mid,
                        "speaker_id": sid,
                        "speaker_name": self._buffers[(mid, sid)].speaker_name,
                        "word_count": self._buffers[(mid, sid)].word_count,
                    }
                    for (mid, sid) in self._buffers
                ],
            }


# ── Singleton ──────────────────────────────────────────────────────────────────
# Import this wherever you need buffer access:
#   from meetings.transcript_buffer import buffer_manager
buffer_manager = TranscriptBufferManager()
