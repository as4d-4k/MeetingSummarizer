"""
Serializers for Meeting, ActionItem, and TranscriptChunk.
"""

from rest_framework import serializers
from .models import Meeting, ActionItem, TranscriptChunk


class ActionItemSerializer(serializers.ModelSerializer):
    """Serializer for individual action items."""

    class Meta:
        model = ActionItem
        fields = [
            "id",
            "meeting",
            "assigned_speaker",
            "task_description",
            "deadline",
            "is_completed",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class TranscriptChunkSerializer(serializers.ModelSerializer):
    """Serializer for transcript chunks."""

    class Meta:
        model = TranscriptChunk
        fields = [
            "id",
            "meeting",
            "chunk_index",
            "raw_text",
            "processed_json",
            "timestamp_start",
            "timestamp_end",
            "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class MeetingListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for listing meetings."""

    action_item_count = serializers.SerializerMethodField()

    class Meta:
        model = Meeting
        fields = [
            "id",
            "meeting_url",
            "title",
            "date",
            "status",
            "action_item_count",
            "created_at",
        ]
        read_only_fields = ["id", "date", "status", "created_at"]

    def get_action_item_count(self, obj):
        return obj.action_items.count()


class MeetingDetailSerializer(serializers.ModelSerializer):
    """Full serializer for a single meeting (includes nested action items & chunks)."""

    action_items = ActionItemSerializer(many=True, read_only=True)
    transcript_chunks = TranscriptChunkSerializer(many=True, read_only=True)

    class Meta:
        model = Meeting
        fields = [
            "id",
            "user",
            "meeting_url",
            "title",
            "date",
            "status",
            "bot_id",
            "target_topics",
            "live_language",
            "summary_language",
            "transcription_mode",
            "full_transcript",
            "final_summary",
            "action_items",
            "transcript_chunks",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "user",
            "date",
            "status",
            "bot_id",
            "full_transcript",
            "final_summary",
            "created_at",
            "updated_at",
        ]


class MeetingCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a new meeting (user pastes a link)."""

    class Meta:
        model = Meeting
        fields = [
            "id",
            "meeting_url",
            "title",
            "target_topics",
            "live_language",
            "summary_language",
            "transcription_mode",   # 'skip' | 'hints' | 'auto'
        ]

    def create(self, validated_data):
        # Automatically assign the logged-in user
        validated_data["user"] = self.context["request"].user
        return super().create(validated_data)
