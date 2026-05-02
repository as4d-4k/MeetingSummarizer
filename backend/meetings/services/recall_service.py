"""
meetings/services/recall_service.py
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
    def create_bot(self, meeting_url: str, bot_name: str = "MeetingIntel Bot") -> dict:
        webhook_base = self._get_webhook_base()
        payload = {
            "meeting_url": meeting_url,
            "bot_name": bot_name,
            "recording_config": {
                "transcript": {
                    "provider": {
                        "gladia_v2_streaming": {
                            "language_config": {
                                "languages": ["ur", "en"]
                            }
                        }
                    }
                },
                "realtime_endpoints": [
                    {
                        "type": "webhook",
                        "url": f"{webhook_base}/api/webhooks/recall/transcript/",
                        "events": ["transcript.data"]
                    }
                ]
            }
        }

        url = f"{RECALL_API_BASE}/bot/"
        logger.info("Creating bot for %s", meeting_url)

        try:
            response = requests.post(
                url, json=payload, headers=self.headers, timeout=60
            )
            logger.info(
                "Recall response: %s %s", response.status_code, response.text[:500]
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as exc:
            if hasattr(exc, "response") and exc.response is not None:
                logger.error("Recall API error: %s", exc.response.text[:500])
            raise RecallServiceError(f"Failed to create bot: {exc}") from exc

    # ──────────────────────────────────────────────
    # Get Bot Status
    # ──────────────────────────────────────────────
    def get_bot_status(self, bot_id: str) -> dict:
        url = f"{RECALL_API_BASE}/bot/{bot_id}/"
        logger.debug("Polling bot status: %s", bot_id)

        try:
            response = requests.get(url, headers=self.headers, timeout=15)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as exc:
            raise RecallServiceError(f"Failed to get bot status: {exc}") from exc

    # ──────────────────────────────────────────────
    # Get Transcript
    # ──────────────────────────────────────────────
    def get_transcript(self, bot_id: str) -> list[dict]:

        url = f"{RECALL_API_BASE}/bot/{bot_id}/transcript/"
        logger.info("Fetching transcript for bot %s", bot_id)

        try:
            response = requests.get(url, headers=self.headers, timeout=30)
            response.raise_for_status()
            data = response.json()

            # Log the raw response so we can see the format
            logger.info("Transcript API raw response: %s", str(data)[:1000])

            results = []
            if isinstance(data, dict):
                results = data.get("results", [])
                logger.info("Transcript results count: %d", len(results))
            elif isinstance(data, list):
                results = data
                logger.info("Transcript list count: %d", len(data))

            all_segments = []
            for item in results:
                # If the item already looks like a segment
                if "speaker" in item or "words" in item or "text" in item:
                    all_segments.append(item)
                    continue

                # Otherwise look for a download_url
                download_url = item.get("data", {}).get("download_url")
                if download_url:
                    try:
                        transcript_resp = requests.get(download_url, timeout=30)
                        transcript_resp.raise_for_status()
                        segments = transcript_resp.json()
                        if isinstance(segments, list):
                            all_segments.extend(segments)
                        elif isinstance(segments, dict) and "segments" in segments:
                            all_segments.extend(segments["segments"])
                    except Exception as e:
                        logger.error("Failed to fetch transcript from download_url: %s", e)

            if all_segments:
                return all_segments

            return results

        except requests.exceptions.RequestException as exc:
            if hasattr(exc, "response") and exc.response is not None:
                logger.error("Transcript API error: %s", exc.response.text[:500])
            raise RecallServiceError(f"Failed to get transcript: {exc}") from exc

    # ──────────────────────────────────────────────
    # Get Recording URL
    # ──────────────────────────────────────────────
    def get_recording_url(self, bot_id: str) -> str | None:
        bot_data = self.get_bot_status(bot_id)

        recordings = bot_data.get("recordings", [])
        if recordings:
            for rec in recordings:
                media_shortcuts = rec.get("media_shortcuts", {})
                video_mixed = media_shortcuts.get("video_mixed", {})
                download_url = video_mixed.get("data", {}).get("download_url")
                if download_url:
                    return download_url

                media = rec.get("media", {})
                if isinstance(media, dict):
                    video_url = media.get("video", {}).get("url")
                    if video_url:
                        return video_url

        return bot_data.get("video_url") or bot_data.get("media", {}).get("video_url")

    # ──────────────────────────────────────────────
    # Download Recording
    # ──────────────────────────────────────────────
    def download_recording(self, recording_url: str, output_path: str) -> str:
        logger.info("Downloading recording to %s", output_path)

        try:
            response = requests.get(recording_url, stream=True, timeout=120)
            response.raise_for_status()

            with open(output_path, "wb") as f:
                for chunk in response.iter_content(chunk_size=8192):
                    f.write(chunk)

            return output_path
        except requests.exceptions.RequestException as exc:
            raise RecallServiceError(f"Failed to download recording: {exc}") from exc

    # ──────────────────────────────────────────────
    # Helpers
    # ──────────────────────────────────────────────
    @staticmethod
    def _get_webhook_base() -> str:
        base = getattr(settings, "WEBHOOK_BASE_URL", "")
        if not base:
            logger.warning("WEBHOOK_BASE_URL not set in settings.")
            return "http://localhost:8000"
        return base.rstrip("/")
