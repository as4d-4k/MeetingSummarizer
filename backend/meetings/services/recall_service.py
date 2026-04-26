"""
Recall.ai API integration service.

Handles:
  - Creating a bot that joins a meeting
  - Polling bot status
  - Downloading the meeting recording

Docs: https://docs.recall.ai/reference
"""

import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

RECALL_API_BASE = "https://ap-northeast-1.recall.ai/api/v1"


class RecallServiceError(Exception):
    """Raised when a Recall.ai API call fails."""
    pass


class RecallService:
    """Client wrapper around the Recall.ai REST API."""

    def __init__(self):
        self.api_key = settings.RECALL_AI_API_KEY
        if not self.api_key:
            raise RecallServiceError("RECALL_AI_API_KEY is not configured.")
        self.headers = {
            "Authorization": f"Token {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    # ──────────────────────────────────────────────
    # Create Bot
    # ──────────────────────────────────────────────
    def create_bot(self, meeting_url: str, bot_name: str = "Meeting Summarizer Bot") -> dict:
        """
        Send a bot to join the meeting.

        Args:
            meeting_url: The meeting link (Zoom, Google Meet, Teams, etc.)
            bot_name: Display name for the bot in the meeting.

        Returns:
            dict with at least {"id": "<bot_id>", "status": "..."}.
        """
        payload = {
            "meeting_url": meeting_url,
            "bot_name": bot_name,
        }

        url = f"{RECALL_API_BASE}/bot/"
        logger.info("Creating Recall.ai bot for %s", meeting_url)

        try:
            response = requests.post(url, json=payload, headers=self.headers, timeout=60)
            response.raise_for_status()
            data = response.json()
            logger.info("Bot created: id=%s", data.get("id"))
            return data
        except requests.exceptions.RequestException as exc:
            # Log the response body for debugging
            if hasattr(exc, 'response') and exc.response is not None:
                logger.error("Recall API error body: %s", exc.response.text[:500])
            logger.error("Failed to create bot: %s", exc)
            raise RecallServiceError(f"Failed to create bot: {exc}") from exc

    # ──────────────────────────────────────────────
    # Get Bot Status
    # ──────────────────────────────────────────────
    def get_bot_status(self, bot_id: str) -> dict:
        """
        Retrieve the current status of a bot.

        Returns:
            dict with bot details including "status_changes" list.
        """
        url = f"{RECALL_API_BASE}/bot/{bot_id}/"
        logger.debug("Polling bot status: %s", bot_id)

        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as exc:
            logger.error("Failed to get bot status: %s", exc)
            raise RecallServiceError(f"Failed to get bot status: {exc}") from exc

    # ──────────────────────────────────────────────
    # Get Transcript
    # ──────────────────────────────────────────────
    def get_transcript(self, bot_id: str) -> list[dict]:
        """
        Retrieve the transcript from a completed bot session.

        Returns:
            List of transcript segments, e.g.:
            [{"speaker": "User 1", "words": [{"text": "...", "start_time": 0.0, ...}]}]
        """
        url = f"{RECALL_API_BASE}/bot/{bot_id}/transcript/"
        logger.info("Fetching transcript for bot %s", bot_id)

        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as exc:
            if hasattr(exc, 'response') and exc.response is not None:
                logger.error("Transcript API error body: %s", exc.response.text[:500])
            logger.error("Failed to get transcript: %s", exc)
            raise RecallServiceError(f"Failed to get transcript: {exc}") from exc

    # ──────────────────────────────────────────────
    # Get Recording URL
    # ──────────────────────────────────────────────
    def get_recording_url(self, bot_id: str) -> str | None:
        """
        Get the download URL for the meeting recording.

        Returns:
            URL string if recording is available, None otherwise.
        """
        bot_data = self.get_bot_status(bot_id)

        # Check recordings array (Recall.ai v1 format)
        recordings = bot_data.get("recordings", [])
        if recordings:
            for rec in recordings:
                # Path: recordings[].media_shortcuts.video_mixed.data.download_url
                media_shortcuts = rec.get("media_shortcuts", {})
                video_mixed = media_shortcuts.get("video_mixed", {})
                download_url = video_mixed.get("data", {}).get("download_url")
                if download_url:
                    logger.info("Recording URL obtained from media_shortcuts for bot %s", bot_id)
                    return download_url

                # Fallback: check media.video.url
                media = rec.get("media", {})
                if isinstance(media, dict):
                    video_url = media.get("video", {}).get("url")
                    if video_url:
                        logger.info("Recording URL obtained from media.video for bot %s", bot_id)
                        return video_url

        # Fallback: check top-level fields
        recording = bot_data.get("video_url") or bot_data.get("media", {}).get("video_url")
        if recording:
            logger.info("Recording URL obtained for bot %s", bot_id)
            return recording

        logger.warning("No recording available yet for bot %s. Bot data keys: %s", bot_id, list(bot_data.keys()))
        return None

    # ──────────────────────────────────────────────
    # Download Recording
    # ──────────────────────────────────────────────
    def download_recording(self, recording_url: str, output_path: str) -> str:
        """
        Download the recording file to local storage.

        Args:
            recording_url: URL of the recording.
            output_path: Local file path to save the recording.

        Returns:
            The output_path where the file was saved.
        """
        logger.info("Downloading recording to %s", output_path)

        try:
            response = requests.get(recording_url, stream=True, timeout=120)
            response.raise_for_status()

            with open(output_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            logger.info("Recording downloaded successfully: %s", output_path)
            return output_path
        except requests.exceptions.RequestException as exc:
            logger.error("Failed to download recording: %s", exc)
            raise RecallServiceError(f"Failed to download recording: {exc}") from exc
