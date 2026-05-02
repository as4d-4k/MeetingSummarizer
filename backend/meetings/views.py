"""
meetings/views.py  — FULL REPLACEMENT
---------------------------------------
Changes from original:
  - Added recall_transcript_webhook() — receives live segments from Recall.ai during meeting
  - Added meeting_live_status() — returns current speaker stats for admin dashboard
  - All original ViewSets unchanged
"""

import logging

from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Meeting, ActionItem, Speaker, LiveTranscriptSegment, SpeakerAnalysis
from .serializers import (
    MeetingListSerializer,
    MeetingDetailSerializer,
    MeetingCreateSerializer,
    ActionItemSerializer,
)

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Original ViewSets — UNCHANGED
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class MeetingViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    filterset_fields = ["status"]
    search_fields = ["title", "full_transcript"]
    ordering_fields = ["date", "created_at", "title"]
    ordering = ["-date"]

    def get_queryset(self):
        return Meeting.objects.filter(user=self.request.user).prefetch_related(
            "action_items", "transcript_chunks"
        )

    def get_serializer_class(self):
        if self.action == "list":
            return MeetingListSerializer
        if self.action == "create":
            return MeetingCreateSerializer
        return MeetingDetailSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="start-bot")
    def start_bot(self, request, pk=None):
        from .services import RecallService, RecallServiceError
        from .tasks import poll_bot_status
        from .transcript_buffer import buffer_manager

        meeting = self.get_object()

        if meeting.status != Meeting.Status.PENDING:
            return Response(
                {"error": f"Meeting is already '{meeting.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            recall_svc = RecallService()
            bot_data = recall_svc.create_bot(
                meeting_url=meeting.meeting_url,
                bot_name="MeetingIntel Bot",
            )
            meeting.bot_id = bot_data.get("id", "")
            meeting.status = Meeting.Status.BOT_JOINING
            meeting.save(update_fields=["bot_id", "status"])

            poll_bot_status.apply_async(args=[meeting.id], countdown=15)

            return Response(
                {
                    "message": "Bot dispatched.",
                    "bot_id": meeting.bot_id,
                    "status": meeting.status,
                },
                status=status.HTTP_200_OK,
            )

        except RecallServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=True, methods=["post"], url_path="reprocess")
    def reprocess(self, request, pk=None):
        from .tasks import process_meeting_pipeline

        meeting = self.get_object()
        if not meeting.full_transcript:
            return Response(
                {"error": "No transcript available."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        meeting.action_items.all().delete()
        meeting.transcript_chunks.all().delete()
        meeting.final_summary = ""
        meeting.status = Meeting.Status.PROCESSING
        meeting.save(update_fields=["final_summary", "status"])
        process_meeting_pipeline.delay(meeting.id)

        return Response({"message": "Reprocessing started.", "status": meeting.status})

    # ── NEW: Get current live speaker stats ──────────────────────────────────
    @action(detail=True, methods=["get"], url_path="live-status")
    def live_status(self, request, pk=None):
        """
        GET /api/meetings/{id}/live-status/
        Returns current speaker stats + recent analyses for the admin dashboard.
        Used as initial snapshot when the dashboard first loads.
        """
        meeting = self.get_object()
        speakers = meeting.speakers.all()

        speaker_data = []
        for sp in speakers:
            latest_analysis = sp.analyses.first()
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
                    "latest_summary": (
                        latest_analysis.summary if latest_analysis else ""
                    ),
                    "key_points": latest_analysis.key_points if latest_analysis else [],
                    "topic_coverage": (
                        latest_analysis.topic_coverage if latest_analysis else {}
                    ),
                }
            )

        # Recent transcript segments (last 30)
        recent_segments = (
            LiveTranscriptSegment.objects.filter(meeting=meeting)
            .select_related("speaker")
            .order_by("-received_at")[:30]
        )

        segments_data = [
            {
                "speaker_name": seg.speaker.name if seg.speaker else "Unknown",
                "speaker_id": seg.speaker_id,
                "text": seg.text,
                "start_time": seg.start_time,
                "end_time": seg.end_time,
            }
            for seg in reversed(list(recent_segments))
        ]

        return Response(
            {
                "meeting_id": meeting.id,
                "status": meeting.status,
                "title": meeting.title,
                "target_topics": getattr(meeting, "target_topics", []),
                "speakers": speaker_data,
                "recent_feed": segments_data,
            }
        )


class ActionItemViewSet(viewsets.ModelViewSet):
    serializer_class = ActionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["is_completed", "meeting"]
    ordering = ["-created_at"]

    def get_queryset(self):
        return ActionItem.objects.filter(
            meeting__user=self.request.user
        ).select_related("meeting")

    @action(detail=True, methods=["post"], url_path="toggle-complete")
    def toggle_complete(self, request, pk=None):
        item = self.get_object()
        item.is_completed = not item.is_completed
        item.save(update_fields=["is_completed"])
        return Response(ActionItemSerializer(item).data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Webhooks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def recall_webhook(request):
    """
    POST /api/webhooks/recall/
    Handles bot STATUS changes (joining, recording, done, failed).
    Unchanged from original.
    """
    data = request.data
    event_data = data.get("data", {})
    bot_id = event_data.get("bot_id", "")
    status_info = event_data.get("status", {})
    status_code = status_info.get("code", "")

    logger.info("Recall status webhook: bot_id=%s status=%s", bot_id, status_code)

    if not bot_id:
        return Response({"error": "No bot_id"}, status=400)

    try:
        meeting = Meeting.objects.get(bot_id=bot_id)
    except Meeting.DoesNotExist:
        return Response({"status": "ignored"}, status=200)

    from .transcript_buffer import buffer_manager

    if status_code == "in_call_recording":
        meeting.status = Meeting.Status.IN_PROGRESS
        meeting.save(update_fields=["status"])
        buffer_manager.activate_meeting(meeting.id)  # ← Start live buffering
        logger.info("Meeting %d: bot recording — live buffer activated", meeting.id)

    elif status_code == "done":
        from .tasks import process_meeting_pipeline

        meeting.status = Meeting.Status.PROCESSING
        meeting.save(update_fields=["status"])
        buffer_manager.deactivate_meeting(meeting.id)  # ← Stop live buffering
        process_meeting_pipeline.delay(meeting.id)
        logger.info("Meeting %d: done → post-meeting pipeline triggered", meeting.id)

    elif status_code in ("fatal", "analysis_failed"):
        meeting.status = Meeting.Status.FAILED
        meeting.save(update_fields=["status"])
        buffer_manager.deactivate_meeting(meeting.id)

    elif status_code in ("joining_call", "in_waiting_room"):
        meeting.status = Meeting.Status.BOT_JOINING
        meeting.save(update_fields=["status"])

    from .broadcast import broadcast_to_meeting

    broadcast_to_meeting(meeting.id, "status_change", {"status": meeting.status})

    return Response({"status": "ok"})


@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def recall_transcript_webhook(request):
    """
    POST /api/webhooks/recall/transcript/

    ── NEW ENDPOINT ──
    Receives real-time transcript segments from Recall.ai AS THE MEETING HAPPENS.
    This fires every few seconds for each speaker's utterance.

    Recall.ai payload format:
    {
        "bot_id": "...",
        "data": {
            "participant": {"id": "...", "name": "Sara Ahmed"},
            "words": [
                {"text": "Hello", "start_time": 12.3, "end_time": 12.7},
                ...
            ],
            "is_final": true
        }
    }
    """
    from .broadcast import broadcast_to_meeting
    from .transcript_buffer import buffer_manager

    root_data = request.data
    event_type = root_data.get("event", "")
    
    payload = root_data.get("data", {})
    
    # Handle different possible webhook payload structures
    bot_id = payload.get("bot_id") or payload.get("bot", {}).get("id", "")
    
    logger.info("RECEIVED WEBHOOK EVENT: %s FOR BOT: %s", event_type, bot_id)
    
    if event_type not in ("transcript.data", "bot.transcript"):
        return Response({"status": "ignored", "note": "not a transcript event"})
    
    segment_data = payload.get("transcript") or payload
    if "participant" not in segment_data and "data" in payload:
         segment_data = payload.get("data", {})

    participant = segment_data.get("participant", {})
    words = segment_data.get("words", [])
    text = segment_data.get("text", "").strip()
    is_final = True

    if not text and words:
        text = " ".join(w.get("text", "") for w in words).strip()

    if not bot_id or not text:
        return Response({"status": "ok", "note": "empty"})

    # Parse timestamps - Recall uses nested "relative" timestamps
    start_time = 0.0
    end_time = 0.0
    if words:
        first_word = words[0]
        last_word = words[-1]
        start_time = first_word.get("start_timestamp", {}).get("relative", 0.0)
        end_time = last_word.get("end_timestamp", {}).get("relative", start_time + 1.0) or (start_time + 1.0)

    participant_id = str(participant.get("id", "unknown"))
    participant_name = participant.get("name", "Unknown Participant")

    # Find the meeting
    try:
        meeting = Meeting.objects.get(bot_id=bot_id)
    except Meeting.DoesNotExist:
        logger.warning("Live transcript webhook: unknown bot_id %s", bot_id)
        return Response({"status": "ignored"})

    meeting_id = meeting.id

    # Get or create Speaker record
    speaker, created = Speaker.objects.get_or_create(
        meeting=meeting,
        recall_participant_id=participant_id,
        defaults={"name": participant_name},
    )
    if created:
        logger.info("New speaker: '%s' in meeting %d", participant_name, meeting_id)
        broadcast_to_meeting(
            meeting_id,
            "speaker_joined",
            {
                "speaker_id": speaker.id,
                "speaker_name": speaker.name,
                "meeting_id": meeting_id,
            },
        )

    # Update speaker talk stats
    word_count_delta = len(text.split())
    talk_delta = max(0, int(end_time - start_time))

    Speaker.objects.filter(pk=speaker.id).update(
        word_count=Speaker.objects.filter(pk=speaker.id).values_list(
            "word_count", flat=True
        )[0]
        + word_count_delta,
        talk_time_seconds=Speaker.objects.filter(pk=speaker.id).values_list(
            "talk_time_seconds", flat=True
        )[0]
        + talk_delta,
        is_speaking=True,
        last_quote=text[:200],
    )
    # Mark all other speakers as not speaking
    Speaker.objects.filter(meeting=meeting).exclude(pk=speaker.id).update(
        is_speaking=False
    )

    # Save live segment to DB
    if is_final:
        LiveTranscriptSegment.objects.create(
            meeting=meeting,
            speaker=speaker,
            text=text,
            start_time=start_time,
            end_time=end_time,
            is_final=is_final,
        )

    # Buffer the segment for 3-min Gemini analysis
    if buffer_manager.is_active(meeting_id):
        buffer_manager.append(
            meeting_id=meeting_id,
            speaker_id=speaker.id,
            speaker_name=speaker.name,
            text=text,
            start_t=start_time,
            end_t=end_time,
        )

    # Immediately push the raw segment to the admin dashboard (live feed)
    speaker_obj = (
        Speaker.objects.filter(pk=speaker.id)
        .values("word_count", "talk_time_seconds")
        .first()
    )

    broadcast_to_meeting(
        meeting_id,
        "transcript_segment",
        {
            "speaker_id": speaker.id,
            "speaker_name": speaker.name,
            "text": text,
            "start_time": start_time,
            "end_time": end_time,
            "is_final": is_final,
            "word_count": (
                speaker_obj["word_count"] if speaker_obj else word_count_delta
            ),
            "talk_time_seconds": (
                speaker_obj["talk_time_seconds"] if speaker_obj else talk_delta
            ),
        },
    )

    return Response({"status": "ok"})
