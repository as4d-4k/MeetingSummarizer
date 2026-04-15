"""
API views for meetings and action items.
"""

import logging

from rest_framework import viewsets, permissions, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Meeting, ActionItem
from .serializers import (
    MeetingListSerializer,
    MeetingDetailSerializer,
    MeetingCreateSerializer,
    ActionItemSerializer,
)

logger = logging.getLogger(__name__)


class MeetingViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for meetings.

    list:    GET    /api/meetings/          — all meetings for the logged-in user
    create:  POST   /api/meetings/          — start a new meeting (paste link)
    detail:  GET    /api/meetings/{id}/     — full meeting detail with action items
    update:  PUT    /api/meetings/{id}/     — update meeting title
    delete:  DELETE /api/meetings/{id}/     — delete a meeting
    """

    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ["status"]
    search_fields = ["title", "full_transcript"]
    ordering_fields = ["date", "created_at", "title"]
    ordering = ["-date"]

    def get_queryset(self):
        """Users can only see their own meetings."""
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
        """
        POST /api/meetings/{id}/start-bot/
        Creates a Recall.ai bot and sends it to join the meeting.
        Then starts polling for bot status.
        """
        from .services import RecallService, RecallServiceError
        from .tasks import poll_bot_status

        meeting = self.get_object()

        if meeting.status != Meeting.Status.PENDING:
            return Response(
                {"error": f"Meeting is already '{meeting.get_status_display()}'."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            # Create Recall.ai bot
            recall_svc = RecallService()
            bot_data = recall_svc.create_bot(
                meeting_url=meeting.meeting_url,
                bot_name="Meeting Summarizer Bot",
            )

            # Save bot_id and update status
            meeting.bot_id = bot_data.get("id", "")
            meeting.status = Meeting.Status.BOT_JOINING
            meeting.save(update_fields=["bot_id", "status"])

            # Start polling for bot status (check every 30 seconds)
            poll_bot_status.apply_async(args=[meeting.id], countdown=15)

            logger.info("Bot dispatched for meeting %d: bot_id=%s", meeting.id, meeting.bot_id)

            return Response(
                {
                    "message": "Bot dispatched to join the meeting.",
                    "bot_id": meeting.bot_id,
                    "status": meeting.status,
                },
                status=status.HTTP_200_OK,
            )

        except RecallServiceError as exc:
            logger.error("Failed to start bot for meeting %d: %s", meeting.id, exc)
            return Response(
                {"error": f"Failed to start bot: {str(exc)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

    @action(detail=True, methods=["post"], url_path="reprocess")
    def reprocess(self, request, pk=None):
        """
        POST /api/meetings/{id}/reprocess/
        Re-run the LLM pipeline on an existing transcript.
        Useful if the meeting already has a transcript but processing failed.
        """
        from .tasks import process_meeting_pipeline

        meeting = self.get_object()

        if not meeting.full_transcript:
            return Response(
                {"error": "No transcript available to reprocess."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Clear old results
        meeting.action_items.all().delete()
        meeting.transcript_chunks.all().delete()
        meeting.final_summary = ""
        meeting.status = Meeting.Status.PROCESSING
        meeting.save(update_fields=["final_summary", "status"])

        # Trigger async pipeline
        process_meeting_pipeline.delay(meeting.id)

        return Response(
            {"message": "Reprocessing started.", "status": meeting.status},
            status=status.HTTP_200_OK,
        )


class ActionItemViewSet(viewsets.ModelViewSet):
    """
    CRUD endpoints for action items within a meeting.

    list:    GET    /api/meetings/action-items/         — all action items for the user
    detail:  GET    /api/meetings/action-items/{id}/    — single action item
    update:  PATCH  /api/meetings/action-items/{id}/    — toggle completion, edit
    delete:  DELETE /api/meetings/action-items/{id}/    — remove an action item
    """

    serializer_class = ActionItemSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ["is_completed", "meeting"]
    ordering_fields = ["created_at", "assigned_speaker"]
    ordering = ["-created_at"]

    def get_queryset(self):
        """Users can only see action items from their own meetings."""
        return ActionItem.objects.filter(
            meeting__user=self.request.user
        ).select_related("meeting")

    @action(detail=True, methods=["post"], url_path="toggle-complete")
    def toggle_complete(self, request, pk=None):
        """POST /api/meetings/action-items/{id}/toggle-complete/"""
        item = self.get_object()
        item.is_completed = not item.is_completed
        item.save(update_fields=["is_completed"])
        return Response(ActionItemSerializer(item).data)


# ──────────────────────────────────────────────────
# Recall.ai Webhook (unauthenticated)
# ──────────────────────────────────────────────────
@api_view(["POST"])
@permission_classes([permissions.AllowAny])
def recall_webhook(request):
    """
    POST /api/webhooks/recall/

    Receives status update callbacks from Recall.ai when bot status changes.
    When the bot is done recording, triggers the processing pipeline.

    Expected payload:
    {
        "event": "bot.status_change",
        "data": {
            "bot_id": "...",
            "status": {"code": "done", ...}
        }
    }
    """
    data = request.data
    event = data.get("event", "")
    event_data = data.get("data", {})
    bot_id = event_data.get("bot_id", "")
    status_info = event_data.get("status", {})
    status_code = status_info.get("code", "")

    logger.info("Recall webhook: event=%s, bot_id=%s, status=%s", event, bot_id, status_code)

    if not bot_id:
        return Response({"error": "No bot_id in payload"}, status=400)

    # Find the meeting associated with this bot
    try:
        meeting = Meeting.objects.get(bot_id=bot_id)
    except Meeting.DoesNotExist:
        logger.warning("Webhook for unknown bot_id: %s", bot_id)
        return Response({"status": "ignored — unknown bot"}, status=200)

    # Handle different bot statuses
    if status_code == "in_call_recording":
        meeting.status = Meeting.Status.IN_PROGRESS
        meeting.save(update_fields=["status"])
        logger.info("Meeting %d: bot is now recording", meeting.id)

    elif status_code == "done":
        # Recording finished — trigger the processing pipeline
        from .tasks import process_meeting_pipeline

        meeting.status = Meeting.Status.PROCESSING
        meeting.save(update_fields=["status"])
        process_meeting_pipeline.delay(meeting.id)
        logger.info("Meeting %d: recording done → pipeline triggered", meeting.id)

    elif status_code in ("fatal", "analysis_failed"):
        meeting.status = Meeting.Status.FAILED
        meeting.save(update_fields=["status"])
        logger.error("Meeting %d: bot failed with status %s", meeting.id, status_code)

    elif status_code in ("joining_call", "in_waiting_room"):
        meeting.status = Meeting.Status.BOT_JOINING
        meeting.save(update_fields=["status"])

    return Response({"status": "ok"}, status=200)
