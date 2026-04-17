"""
Utility to broadcast messages to WebSocket clients from sync code (e.g. Celery tasks).
"""

from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def broadcast_to_meeting(meeting_id: int, event_type: str, data: dict):
    """
    Send a message to all WebSocket clients watching a specific meeting.

    Args:
        meeting_id: The meeting PK.
        event_type: One of 'transcript_chunk', 'action_item', 'status_change', 'summary_update'.
        data: The payload dict.
    """
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    async_to_sync(channel_layer.group_send)(
        f"meeting_{meeting_id}",
        {"type": event_type, "data": data},
    )
