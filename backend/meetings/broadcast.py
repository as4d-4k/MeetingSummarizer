import logging
import os
import sys

import requests
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync

logger = logging.getLogger(__name__)


def _is_celery_process():
    """Detect if we are running inside a Celery worker process."""
    # Primary check: Celery sets this in sys.argv
    if "celery" in sys.argv[0].lower():
        return True
    # Fallback: check if the current process was started as a worker
    try:
        from celery import current_app
        return bool(current_app.conf.get("CELERY_WORKER_RUNNING"))
    except Exception:
        pass
    return False


def broadcast_to_meeting(meeting_id: int, event_type: str, data: dict):
    """
    Send a message to all WebSocket clients watching a specific meeting.
    If called from Celery, bridges the message via HTTP so Daphne's
    InMemoryChannelLayer receives it.
    """
    if _is_celery_process():
        # Bounce through HTTP so Daphne's InMemoryChannelLayer receives it
        try:
            resp = requests.post(
                "http://127.0.0.1:8000/api/meetings/internal_broadcast/",
                json={"meeting_id": meeting_id, "event_type": event_type, "data": data},
                timeout=5,
            )
            logger.info(
                "HTTP bridge broadcast: meeting=%s type=%s status=%s",
                meeting_id, event_type, resp.status_code,
            )
        except Exception as e:
            logger.error("HTTP bridge broadcast FAILED: meeting=%s type=%s err=%s", meeting_id, event_type, e)
    else:
        broadcast_to_meeting_direct(meeting_id, event_type, data)


def broadcast_to_meeting_direct(meeting_id: int, event_type: str, data: dict):
    """Send directly via the in-process channel layer (Daphne only)."""
    channel_layer = get_channel_layer()
    if channel_layer is None:
        logger.warning("No channel layer available for broadcast: meeting=%s type=%s", meeting_id, event_type)
        return
    async_to_sync(channel_layer.group_send)(
        f"meeting_{meeting_id}",
        {"type": event_type, "data": data},
    )
    logger.debug("Direct broadcast: meeting=%s type=%s", meeting_id, event_type)
