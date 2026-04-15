"""
Admin configuration for meetings and action items.
"""

from django.contrib import admin
from .models import Meeting, ActionItem, TranscriptChunk


class ActionItemInline(admin.TabularInline):
    model = ActionItem
    extra = 0
    readonly_fields = ["created_at"]


class TranscriptChunkInline(admin.TabularInline):
    model = TranscriptChunk
    extra = 0
    readonly_fields = ["created_at"]


@admin.register(Meeting)
class MeetingAdmin(admin.ModelAdmin):
    list_display = ["title", "user", "status", "date", "created_at"]
    list_filter = ["status", "date"]
    search_fields = ["title", "meeting_url", "full_transcript"]
    readonly_fields = ["bot_id", "created_at", "updated_at"]
    inlines = [ActionItemInline, TranscriptChunkInline]


@admin.register(ActionItem)
class ActionItemAdmin(admin.ModelAdmin):
    list_display = ["assigned_speaker", "task_description", "is_completed", "meeting", "created_at"]
    list_filter = ["is_completed"]
    search_fields = ["assigned_speaker", "task_description"]


@admin.register(TranscriptChunk)
class TranscriptChunkAdmin(admin.ModelAdmin):
    list_display = ["meeting", "chunk_index", "timestamp_start", "timestamp_end", "created_at"]
    list_filter = ["meeting"]
