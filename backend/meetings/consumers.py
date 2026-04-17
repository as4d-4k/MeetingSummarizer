"""
WebSocket consumer for live meeting updates.
Pushes transcript chunks, action items, and status changes to connected clients.
"""

import json
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)


class MeetingConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket endpoint: ws://host/ws/meetings/<meeting_id>/

    Clients join a group for a specific meeting and receive:
      - transcript_chunk: new chunk processed
      - action_item: new action item extracted
      - status_change: meeting status updated
      - summary_update: final summary generated
    """

    async def connect(self):
        self.meeting_id = self.scope["url_route"]["kwargs"]["meeting_id"]
        self.group_name = f"meeting_{self.meeting_id}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        await self.accept()
        logger.info("WS connected: meeting=%s", self.meeting_id)

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group_name, self.channel_name)
        logger.info("WS disconnected: meeting=%s", self.meeting_id)

    # ── Event handlers (called via channel_layer.group_send) ──

    async def transcript_chunk(self, event):
        await self.send_json({"type": "transcript_chunk", "data": event["data"]})

    async def action_item(self, event):
        await self.send_json({"type": "action_item", "data": event["data"]})

    async def status_change(self, event):
        await self.send_json({"type": "status_change", "data": event["data"]})

    async def summary_update(self, event):
        await self.send_json({"type": "summary_update", "data": event["data"]})
