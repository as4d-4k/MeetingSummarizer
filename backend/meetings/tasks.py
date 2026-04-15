"""
Celery tasks for the meeting processing pipeline.

Main orchestrator task: process_meeting_pipeline
  1. Fetch transcript/recording from Recall.ai
  2. Transcribe with Whisper (if audio) or assemble Recall transcript
  3. Chunk the transcript into ~3-min segments
  4. Process each chunk through LLM (translate + extract action items)
  5. Generate final coherent summary
  6. Save all results to the database
"""

import json
import logging
import os
import tempfile

from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_meeting_pipeline(self, meeting_id: int):
    """
    Main pipeline task — processes a meeting end-to-end.

    This is triggered when:
      - A Recall.ai webhook notifies us that recording is ready
      - OR manually via the admin/API

    Args:
        meeting_id: Primary key of the Meeting record.
    """
    from meetings.models import Meeting, ActionItem, TranscriptChunk
    from meetings.services import RecallService, TranscriptionService, LLMService

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        logger.error("Meeting %d not found", meeting_id)
        return {"error": f"Meeting {meeting_id} not found"}

    logger.info("═══ Starting pipeline for Meeting %d: %s ═══", meeting_id, meeting.title or meeting.meeting_url)

    # Mark as processing
    meeting.status = Meeting.Status.PROCESSING
    meeting.save(update_fields=["status"])

    try:
        # ─── Step 1: Get transcript from Recall.ai ───
        transcript_text = _fetch_transcript(meeting)

        if not transcript_text:
            raise ValueError("Empty transcript — nothing to process")

        # Save raw transcript
        meeting.full_transcript = transcript_text
        meeting.save(update_fields=["full_transcript"])
        logger.info("Step 1 complete: transcript fetched (%d chars)", len(transcript_text))

        # ─── Step 2: Chunk the transcript ───
        transcription_svc = TranscriptionService()
        chunks = transcription_svc.chunk_transcript(transcript_text)
        logger.info("Step 2 complete: %d chunks created", len(chunks))

        # ─── Step 3: Process each chunk through LLM ───
        llm_svc = LLMService()
        chunk_results = []

        for chunk_data in chunks:
            # Process through LLM
            processed = llm_svc.process_chunk(
                raw_text=chunk_data["text"],
                chunk_index=chunk_data["chunk_index"],
            )
            chunk_results.append(processed)

            # Save TranscriptChunk to DB
            TranscriptChunk.objects.update_or_create(
                meeting=meeting,
                chunk_index=chunk_data["chunk_index"],
                defaults={
                    "raw_text": chunk_data["text"],
                    "processed_json": processed,
                    "timestamp_start": chunk_data["start"],
                    "timestamp_end": chunk_data["end"],
                },
            )

            # Extract and save action items from this chunk
            for item in processed.get("action_items", []):
                ActionItem.objects.create(
                    meeting=meeting,
                    assigned_speaker=item.get("assigned_to", "Unassigned"),
                    task_description=item.get("task", ""),
                    deadline=item.get("deadline"),
                )

        logger.info("Step 3 complete: all chunks processed, %d action items saved",
                     meeting.action_items.count())

        # ─── Step 4: Generate final summary ───
        final_output = llm_svc.generate_final_summary(chunk_results)

        # Build the final summary text
        summary_parts = []
        if final_output.get("title"):
            meeting.title = final_output["title"]
        if final_output.get("executive_summary"):
            summary_parts.append(f"## Executive Summary\n{final_output['executive_summary']}")
        if final_output.get("key_topics"):
            topics = "\n".join(f"- {t}" for t in final_output["key_topics"])
            summary_parts.append(f"## Key Topics\n{topics}")
        if final_output.get("detailed_summary"):
            summary_parts.append(f"## Detailed Summary\n{final_output['detailed_summary']}")

        # Add consolidated action items from final summary
        overall_items = final_output.get("overall_action_items", [])
        if overall_items:
            items_text = "\n".join(
                f"- **{item.get('assigned_to', 'Unassigned')}**: {item.get('task', '')} "
                f"{'(Deadline: ' + item['deadline'] + ')' if item.get('deadline') else ''}"
                for item in overall_items
            )
            summary_parts.append(f"## Action Items\n{items_text}")

        meeting.final_summary = "\n\n".join(summary_parts)
        meeting.status = Meeting.Status.COMPLETED
        meeting.save(update_fields=["title", "final_summary", "status"])

        logger.info("═══ Pipeline complete for Meeting %d ═══", meeting_id)
        return {
            "meeting_id": meeting_id,
            "status": "completed",
            "chunks_processed": len(chunk_results),
            "action_items": meeting.action_items.count(),
        }

    except Exception as exc:
        logger.exception("Pipeline failed for meeting %d: %s", meeting_id, exc)
        meeting.status = Meeting.Status.FAILED
        meeting.save(update_fields=["status"])

        # Retry on transient errors
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)

        return {"error": str(exc), "meeting_id": meeting_id}


def _fetch_transcript(meeting) -> str:
    """
    Attempt to get the transcript via Recall.ai.

    Tries two approaches:
      1. Get the Recall.ai built-in transcript (faster, if available)
      2. Download recording + transcribe with Whisper (more accurate for Urdu)

    Falls back to any existing transcript on the meeting record.
    """
    from meetings.services import RecallService, TranscriptionService

    if not meeting.bot_id:
        logger.warning("No bot_id on meeting %d — using existing transcript", meeting.id)
        return meeting.full_transcript

    recall_svc = RecallService()
    transcription_svc = TranscriptionService()

    # Try 1: Get Recall.ai's built-in transcript
    try:
        segments = recall_svc.get_transcript(meeting.bot_id)
        if segments:
            transcript = transcription_svc.assemble_recall_transcript(segments)
            if transcript:
                logger.info("Using Recall.ai built-in transcript")
                return transcript
    except Exception as exc:
        logger.warning("Recall transcript fetch failed: %s — trying recording", exc)

    # Try 2: Download recording and transcribe with Whisper
    try:
        recording_url = recall_svc.get_recording_url(meeting.bot_id)
        if recording_url:
            # Download to a temp file
            media_dir = os.path.join(settings.BASE_DIR, "media", "recordings")
            os.makedirs(media_dir, exist_ok=True)
            output_path = os.path.join(media_dir, f"meeting_{meeting.id}.mp4")

            recall_svc.download_recording(recording_url, output_path)
            transcript = transcription_svc.transcribe_audio(output_path)

            # Clean up the recording file
            try:
                os.remove(output_path)
            except OSError:
                pass

            if transcript:
                logger.info("Using Whisper-transcribed audio")
                return transcript
    except Exception as exc:
        logger.warning("Recording transcription failed: %s", exc)

    # Fallback: return whatever we have
    logger.warning("All transcript methods failed — using existing data")
    return meeting.full_transcript


@shared_task
def poll_bot_status(meeting_id: int):
    """
    Periodic task to check if a Recall.ai bot has finished recording.

    If the bot has finished, triggers the processing pipeline.
    If still recording, reschedules itself.
    """
    from meetings.models import Meeting
    from meetings.services import RecallService

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        logger.error("Meeting %d not found for polling", meeting_id)
        return

    if meeting.status in (Meeting.Status.COMPLETED, Meeting.Status.FAILED):
        logger.info("Meeting %d already %s — skipping poll", meeting_id, meeting.status)
        return

    if not meeting.bot_id:
        logger.warning("Meeting %d has no bot_id — skipping poll", meeting_id)
        return

    try:
        recall_svc = RecallService()
        bot_data = recall_svc.get_bot_status(meeting.bot_id)
        status_changes = bot_data.get("status_changes", [])

        if status_changes:
            latest_status = status_changes[-1].get("code", "")
            logger.info("Bot %s status: %s", meeting.bot_id, latest_status)

            if latest_status == "done":
                # Bot finished — trigger processing
                meeting.status = Meeting.Status.PROCESSING
                meeting.save(update_fields=["status"])
                process_meeting_pipeline.delay(meeting_id)
                return

            elif latest_status in ("fatal", "analysis_failed"):
                meeting.status = Meeting.Status.FAILED
                meeting.save(update_fields=["status"])
                logger.error("Bot %s failed with status: %s", meeting.bot_id, latest_status)
                return

        # Still in progress — poll again in 30 seconds
        if meeting.status in (Meeting.Status.BOT_JOINING, Meeting.Status.IN_PROGRESS):
            poll_bot_status.apply_async(args=[meeting_id], countdown=30)

    except Exception as exc:
        logger.error("Error polling bot status for meeting %d: %s", meeting_id, exc)
        # Retry polling after 60 seconds
        poll_bot_status.apply_async(args=[meeting_id], countdown=60)
