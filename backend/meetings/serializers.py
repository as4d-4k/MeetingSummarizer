"""
Serializers for Meeting, ActionItem, and TranscriptChunk.
"""

from rest_framework import serializers
from .models import Meeting, ActionItem, TranscriptChunk, TeamDirectory


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
            "speaker",
            "notification_sent",
            "notification_sent_at",
            "created_at",
        ]
        read_only_fields = ["id", "created_at", "notification_sent", "notification_sent_at"]


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


class TeamDirectorySerializer(serializers.ModelSerializer):
    """Serializer for Team Directory entries."""

    class Meta:
        model = TeamDirectory
        fields = [
            "id",
            "name",
            "email",
            "slack_id",
            "key",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "key", "created_at", "updated_at"]
        extra_kwargs = {
            "email": {"required": True, "allow_blank": False},
        }

    def validate(self, attrs):
        request = self.context.get("request")
        user = request.user
        name = attrs.get("name")
        email = attrs.get("email")
        slack_id = attrs.get("slack_id")

        instance_id = self.instance.id if self.instance else None

        if name:
            query = TeamDirectory.objects.filter(user=user, name__iexact=name)
            if instance_id:
                query = query.exclude(id=instance_id)
            if query.exists():
                raise serializers.ValidationError({"name": "Display name already exists in your Team Directory."})

        if email:
            query = TeamDirectory.objects.filter(user=user, email=email)
            if instance_id:
                query = query.exclude(id=instance_id)
            if query.exists():
                raise serializers.ValidationError({"email": "This email already exists in your Team Directory."})

        if slack_id:
            query = TeamDirectory.objects.filter(user=user, slack_id=slack_id)
            if instance_id:
                query = query.exclude(id=instance_id)
            if query.exists():
                raise serializers.ValidationError({"slack_id": "This Slack ID already exists in your Team Directory."})

        return attrs

    def create(self, validated_data):
        from meetings.models import generate_10_digit_key
        user = self.context["request"].user
        validated_data["user"] = user
        # Key = 10 random chars + admin's 4-char org_key
        validated_data["key"] = generate_10_digit_key() + user.org_key
        return super().create(validated_data)
