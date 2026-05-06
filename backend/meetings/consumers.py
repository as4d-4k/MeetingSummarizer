"""
meetings/consumers.py  — FULL REPLACEMENT
------------------------------------------
Changes from original:
  - Added handlers for new live event types:
      transcript_segment  → raw live utterance from a speaker
      speaker_joined      → new participant detected
      analysis_update     → Gemini 3-min window result
  - connect() now sends a snapshot of current speaker state on connect
  - Original handlers (transcript_chunk, action_item, status_change, summary_update) unchanged
"""

import json
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from channels.db import database_sync_to_async

logger = logging.getLogger(__name__)


class MeetingConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket endpoint: ws://host/ws/meetings/<meeting_id>/

    Admin dashboard connects here to receive live events.
    On connect, sends a snapshot of the current meeting state.

    Event types pushed to client:
      LIVE (new):
        transcript_segment  — raw speaker utterance (every few seconds)
        speaker_joined      — new participant detected
        analysis_update     — Gemini per-speaker 3-min analysis result

      POST-MEETING (original):
        transcript_chunk    — processed chunk summary
        action_item         — extracted action item
        status_change       — meeting status update
        summary_update      — final summary generated
    """

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]
        self.group_name = f"meeting_{self.meeting_id}"

        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("WS connected: meeting=%s", self.meeting_id)

        # Send current state snapshot so dashboard hydrates immediately
        await self._send_snapshot()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("WS disconnected: meeting=%s, code=%s", self.meeting_id, close_code)

    async def receive_json(self, content):
        """Handle ping from client (keepalive)."""
        if content.get("type") == "ping":
            await self.send_json({"type": "pong"})

    # ── Snapshot on connect ────────────────────────────────────────────────────

    async def _send_snapshot(self):
        """
        Push the current meeting state to a freshly connected dashboard.
        This avoids the dashboard being blank until the next broadcast event.
        """
        snapshot = await self._build_snapshot()
        if snapshot:
            await self.send_json({"type": "snapshot", "data": snapshot})

    @database_sync_to_async
    def _build_snapshot(self):
        try:
            from meetings.models import Meeting, Speaker, LiveTranscriptSegment

            meeting = Meeting.objects.prefetch_related("speakers").get(
                pk=self.meeting_id
            )
            speakers = list(meeting.speakers.all())

            speaker_data = []
            for sp in speakers:
                latest = sp.analyses.first()
                summary_text = latest.summary if latest else ""
                speaker_data.append(
                    {
                        "id": sp.id,
                        "name": sp.name,
                        "is_speaking": sp.is_speaking,
                        "talk_time_seconds": sp.talk_time_seconds,
                        "word_count": sp.word_count,
                        "performance_score": sp.performance_score,
                        "sentiment": sp.sentiment,
                        "last_quote": sp.last_quote,
                        "summary": summary_text,
                        "latest_summary": summary_text,
                        "key_points": latest.key_points if latest else [],
                        "topic_coverage": latest.topic_coverage if latest else {},
                    }
                )

            recent_segments = list(
                LiveTranscriptSegment.objects.filter(meeting=meeting)
                .select_related("speaker")
                .order_by("-received_at")[:30]
            )

            feed = [
                {
                    "speaker_id": seg.speaker_id,
                    "speaker_name": seg.speaker.name if seg.speaker else "Unknown",
                    "text": seg.text,
                    "start_time": seg.start_time,
                    "end_time": seg.end_time,
                }
                for seg in reversed(recent_segments)
            ]

            return {
                "meeting": {
                    "id": meeting.id,
                    "title": meeting.title,
                    "status": meeting.status,
                    "target_topics": getattr(meeting, "target_topics", []),
                },
                "speakers": speaker_data,
                "recent_feed": feed,
            }
        except Exception as e:
            logger.error("Snapshot build failed: %s", e)
            return None

    # ── NEW: Live event handlers ───────────────────────────────────────────────

    async def transcript_segment(self, event):
        """Raw live utterance from a speaker — pushed to live feed."""
        await self.send_json({"type": "transcript_segment", "data": event["data"]})

    async def speaker_joined(self, event):
        """New participant appeared in the meeting."""
        await self.send_json({"type": "speaker_joined", "data": event["data"]})

    async def analysis_update(self, event):
        """Gemini 3-minute window analysis result for a speaker."""
        await self.send_json({"type": "analysis_update", "data": event["data"]})

    # ── Original event handlers — UNCHANGED ───────────────────────────────────

    async def transcript_chunk(self, event):
        await self.send_json({"type": "transcript_chunk", "data": event["data"]})

    async def action_item(self, event):
        await self.send_json({"type": "action_item", "data": event["data"]})

    async def status_change(self, event):
        await self.send_json({"type": "status_change", "data": event["data"]})

    async def summary_update(self, event):
        await self.send_json({"type": "summary_update", "data": event["data"]})

    async def transcript_update(self, event):
        await self.send_json({"type": "transcript_update", "data": event["data"]})
