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

from .models import Meeting, ActionItem, Speaker, LiveTranscriptSegment, SpeakerAnalysis, TeamDirectory
from .serializers import (
    MeetingListSerializer,
    MeetingDetailSerializer,
    MeetingCreateSerializer,
    ActionItemSerializer,
    TeamDirectorySerializer,
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
        from .tasks import dispatch_bot_join
        from .broadcast import broadcast_to_meeting

        meeting = self.get_object()

        if meeting.status != Meeting.Status.PENDING:
            return Response(
                {"error": f"Meeting is already '{meeting.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # ── Immediately lock status in DB — no blocking API calls ──
        live_language = getattr(meeting, 'live_language', 'English')
        transcription_mode = getattr(meeting, 'transcription_mode', 'auto')
        hint_phrases = []
        skip_warmup_secs = 0.0

        if transcription_mode == 'hints':
            try:
                profile = request.user.language_profile
                hint_phrases = profile.hint_phrases or []
                logger.info("start_bot: %d hint phrases for meeting %d", len(hint_phrases), meeting.id)
            except Exception:
                logger.warning("No language profile for user %s", request.user.email)
        elif transcription_mode == 'skip':
            skip_warmup_secs = 8.0

        meeting.status = Meeting.Status.BOT_JOINING
        meeting.save(update_fields=["status"])

        # Broadcast immediately — frontend and all WS clients see BOT_JOINING now
        broadcast_to_meeting(meeting.id, "status_change", {"status": "bot_joining"})

        # ── Fire-and-forget: actual Recall.ai API call runs in Celery ──
        dispatch_bot_join.apply_async(
            args=[meeting.id, live_language],
            countdown=0,
        )

        return Response(
            {
                "message":            "Bot dispatching…",
                "status":             "bot_joining",
                "transcription_mode": transcription_mode,
                "hints_loaded":       len(hint_phrases),
                "skip_warmup_secs":   skip_warmup_secs,
            },
            status=status.HTTP_200_OK,
        )

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

    @action(detail=True, methods=["post"], url_path="end-bot")
    def end_bot(self, request, pk=None):
        from .services import RecallService, RecallServiceError
        meeting = self.get_object()

        if not meeting.bot_id:
            return Response({"error": "No bot associated with this meeting."}, status=status.HTTP_400_BAD_REQUEST)

        if meeting.status not in [Meeting.Status.BOT_JOINING, Meeting.Status.IN_PROGRESS]:
            return Response({"error": f"Cannot end bot in status: {meeting.get_status_display()}"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            recall_svc = RecallService()
            recall_svc.leave_bot(meeting.bot_id)

            # ── Lock status to PROCESSING in the DB immediately ──
            # This prevents poll_bot_status and frontend polling from
            # reverting the status back to "in_progress".
            from .broadcast import broadcast_to_meeting
            from .transcript_buffer import buffer_manager
            from .tasks import process_meeting_pipeline

            meeting.status = Meeting.Status.PROCESSING
            meeting.save(update_fields=["status"])

            buffer_manager.deactivate_meeting(meeting.id)
            broadcast_to_meeting(meeting.id, "status_change", {"status": "processing"})

            # Give Recall.ai 30s to finalize the recording, then run the pipeline
            process_meeting_pipeline.apply_async(
                args=[meeting.id],
                countdown=30,
            )

            return Response({"message": "Bot is leaving. Processing will begin shortly.", "status": "processing"}, status=status.HTTP_200_OK)
        except RecallServiceError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_502_BAD_GATEWAY)

    @action(detail=True, methods=["post"], url_path="send-notifications")
    def send_notifications(self, request, pk=None):
        """
        POST /api/meetings/{id}/send-notifications/
        Manually trigger action item notifications for this meeting.
        """
        from .tasks import distribute_action_items

        meeting = self.get_object()
        if meeting.status != Meeting.Status.COMPLETED:
            return Response(
                {"error": "Meeting must be completed before sending notifications."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        distribute_action_items.apply_async(args=[meeting.id])
        return Response(
            {"message": "Notification distribution triggered."},
            status=status.HTTP_200_OK,
        )
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


from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny

@api_view(["POST"])
@permission_classes([AllowAny])
def internal_broadcast_view(request):
    """
    Called by Celery to bounce a WebSocket message through the Django server.
    Because InMemoryChannelLayer cannot be accessed from a separate Celery process,
    Celery makes a POST to this endpoint, and Django (which owns the WebSockets) broadcasts it.
    """
    meeting_id = request.data.get("meeting_id")
    event_type = request.data.get("event_type")
    data = request.data.get("data")

    if not meeting_id or not event_type:
        return Response({"error": "missing meeting_id or event_type"}, status=400)

    logger.info(
        "internal_broadcast_view: meeting=%s type=%s",
        meeting_id, event_type,
    )

    from meetings.broadcast import broadcast_to_meeting_direct
    broadcast_to_meeting_direct(meeting_id, event_type, data or {})
    return Response({"status": "ok"})


class TeamDirectoryViewSet(viewsets.ModelViewSet):
    """
    CRUD for the logged-in user's Team Directory.
    GET    /api/team-directory/         → list all entries
    POST   /api/team-directory/         → create new entry
    PUT    /api/team-directory/{id}/    → update entry
    DELETE /api/team-directory/{id}/    → delete entry
    """
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = TeamDirectorySerializer
    search_fields = ["name", "email"]
    filter_backends = [filters.SearchFilter, filters.OrderingFilter]
    ordering = ["name"]

    def get_queryset(self):
        return TeamDirectory.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"], url_path="send-credentials")
    def send_credentials(self, request, pk=None):
        member = self.get_object()
        if not member.email:
            return Response({"error": "This member does not have an email address."}, status=status.HTTP_400_BAD_REQUEST)
        
        from meetings.services.notification_service import NotificationService
        svc = NotificationService()
        success = svc.send_credentials_email(
            email=member.email,
            name=member.name,
            slack_id=member.slack_id,
            key=member.key
        )
        if success:
            return Response({"message": "Credentials sent successfully."})
        return Response({"error": "Failed to send email."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    @action(detail=True, methods=["get"], url_path="profile")
    def profile(self, request, pk=None):
        """
        GET /api/team-directory/{id}/profile/
        Returns full profile data: info, overall score, meeting history with scores & sentiment.
        """
        from meetings.models import UserMeetingScore
        from django.db.models import Avg

        member = self.get_object()
        scores = UserMeetingScore.objects.filter(team_member=member).order_by("meeting_date")

        # Overall performance = rolling average of all meeting scores
        agg = scores.aggregate(avg_score=Avg("performance_score"))
        overall_score = round(agg["avg_score"] or 0, 1)

        # Meeting history for graphs
        meeting_history = []
        for s in scores:
            meeting_history.append({
                "id": s.id,
                "meeting_id": s.meeting_id,
                "meeting_title": s.meeting.title or "Untitled Meeting",
                "meeting_date": s.meeting_date.isoformat(),
                "performance_score": s.performance_score,
                "sentiment_positive": s.sentiment_positive,
                "sentiment_neutral": s.sentiment_neutral,
                "sentiment_negative": s.sentiment_negative,
                "word_count": s.word_count,
                "talk_time_seconds": s.talk_time_seconds,
                "contribution_summary": s.contribution_summary,
            })

        total_meetings = scores.count()
        total_words = sum(s.word_count for s in scores)
        total_talk_time = sum(s.talk_time_seconds for s in scores)

        # ── Leaderboard: rank this member among all team members ──
        all_members = TeamDirectory.objects.filter(user=request.user)
        leaderboard = []
        for m in all_members:
            m_scores = UserMeetingScore.objects.filter(team_member=m)
            m_agg = m_scores.aggregate(avg=Avg("performance_score"))
            m_avg = round(m_agg["avg"] or 0, 1)
            leaderboard.append({
                "id": m.id,
                "name": m.name,
                "score": m_avg,
                "meetings": m_scores.count(),
            })
        leaderboard.sort(key=lambda x: x["score"], reverse=True)

        # Find this member's rank
        my_rank = next((i + 1 for i, lb in enumerate(leaderboard) if lb["id"] == member.id), 0)

        # Best / worst scores
        score_values = [s.performance_score for s in scores]
        best_score = max(score_values) if score_values else 0
        worst_score = min(score_values) if score_values else 0

        return Response({
            "member": {
                "id": member.id,
                "name": member.name,
                "email": member.email,
                "slack_id": member.slack_id,
                "key": member.key,
                "created_at": member.created_at.isoformat(),
            },
            "overall_score": overall_score,
            "total_meetings": total_meetings,
            "total_words": total_words,
            "total_talk_time": total_talk_time,
            "best_score": round(best_score, 1),
            "worst_score": round(worst_score, 1),
            "rank": my_rank,
            "leaderboard": leaderboard[:10],
            "meeting_history": meeting_history,
        })


