"""
meetings/tasks.py  — FULL REPLACEMENT
---------------------------------------
Changes from original:
  - Added flush_speaker_buffers() — the core live task, runs every 3 minutes via Celery Beat
  - Added flush_single_speaker() — processes one speaker's buffer window
  - Original process_meeting_pipeline() and poll_bot_status() unchanged
"""

import json
import logging
import os

from celery import shared_task
from django.conf import settings

from meetings.broadcast import broadcast_to_meeting
from meetings.transcript_buffer import buffer_manager

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# NEW: Live per-speaker buffer flush (runs every 1 minute)
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@shared_task
def flush_speaker_buffers():
    """
    Runs every 60 real-world seconds via Celery Beat.
    For each active meeting, collects speech from the LAST 60 seconds of REAL clock time
    and sends it to the LLM for cumulative speaker analysis.
    Uses django timezone.now() for windowing — NOT audio timestamps.
    """
    from django.utils import timezone
    from meetings.models import Meeting, Speaker, LiveTranscriptSegment

    now = timezone.now()
    # 1-minute window: segments received in the last 60 seconds
    window_start_dt = now - timezone.timedelta(seconds=60)

    active_meetings = Meeting.objects.filter(
        status__in=[Meeting.Status.IN_PROGRESS, Meeting.Status.BOT_JOINING]
    )
    total_flushed = 0

    for meeting in active_meetings:
        speakers = meeting.speakers.all()
        for speaker in speakers:
            # Get segments received in the last 60 real seconds
            segments = LiveTranscriptSegment.objects.filter(
                meeting=meeting,
                speaker=speaker,
                received_at__gte=window_start_dt,
            ).order_by("start_time")

            if not segments.exists():
                continue

            text = " ".join(s.text for s in segments)
            word_count = len(text.split())

            if word_count < 5:
                continue

            # Use real wall-clock unix timestamps for the window label
            window_start_unix = window_start_dt.timestamp()
            window_end_unix = now.timestamp()

            flush_single_speaker.delay(
                meeting_id=meeting.id,
                speaker_id=speaker.id,
                speaker_name=speaker.name,
                text=text,
                window_start=window_start_unix,
                window_end=window_end_unix,
            )
            total_flushed += 1

    logger.info("flush_speaker_buffers: flushed %d speaker windows", total_flushed)
    return {"flushed": total_flushed}


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def flush_single_speaker(self, meeting_id: int, speaker_id: int, speaker_name: str, text: str, window_start: float, window_end: float):
    """
    Runs Gemini analysis on a speaker's text window.
    """
    from meetings.models import Meeting, Speaker, SpeakerAnalysis
    from meetings.services import LLMService

    word_count = len(text.split())

    logger.info(
        "Analysing speaker '%s' window %s→%s (%d words)",
        speaker_name,
        _fmt_time(window_start),
        _fmt_time(window_end),
        word_count,
    )

    try:
        # 1. Get previous summary
        last_analysis = SpeakerAnalysis.objects.filter(
            meeting_id=meeting_id, speaker_id=speaker_id
        ).order_by("-window_end").first()
        previous_summary = last_analysis.summary if last_analysis else ""

        # 2. Get meeting target topics
        meeting = Meeting.objects.get(pk=meeting_id)
        target_topics = (
            meeting.target_topics if hasattr(meeting, "target_topics") else []
        )
        live_language = getattr(meeting, "live_language", "English")

        # 3. Run Gemini analysis
        llm_svc = LLMService()
        analysis = llm_svc.analyse_speaker_window(
            speaker_name=speaker_name,
            transcript_text=text,
            target_topics=target_topics,
            window_start=window_start,
            window_end=window_end,
            previous_summary=previous_summary,
            live_language=live_language,
        )

        # 4. Save SpeakerAnalysis to DB
        engagement = analysis.get("engagement_signals", {})
        if isinstance(engagement, dict):
            engagement_dict = engagement
        else:
            engagement_dict = (
                engagement.model_dump() if hasattr(engagement, "model_dump") else {}
            )

        sa = SpeakerAnalysis.objects.create(
            meeting_id=meeting_id,
            speaker_id=speaker_id,
            window_start=window_start,
            window_end=window_end,
            sentiment=analysis.get("sentiment", "neutral"),
            performance_score=analysis.get("performance_score"),
            summary=analysis.get("summary", ""),
            key_points=analysis.get("key_points", []),
            topic_coverage=analysis.get("topic_coverage", {}),
            one_line_quote=analysis.get("one_line_quote", ""),
            engagement_signals=engagement_dict,
            raw_response=analysis,
        )

        # 5. Update speaker stats
        Speaker.objects.filter(pk=speaker_id).update(
            performance_score=analysis.get("performance_score"),
            sentiment=analysis.get("sentiment", "neutral"),
            last_quote=analysis.get("one_line_quote", "")[:500],
        )

        # 6. Broadcast to admin dashboard
        broadcast_to_meeting(
            meeting_id,
            "analysis_update",
            {
                "speaker_id": speaker_id,
                "speaker_name": speaker_name,
                "sentiment": analysis.get("sentiment"),
                "performance_score": analysis.get("performance_score"),
                "summary": analysis.get("summary", ""),
                "key_points": analysis.get("key_points", []),
                "topic_coverage": analysis.get("topic_coverage", {}),
                "one_line_quote": analysis.get("one_line_quote", ""),
                "window_start": window_start,
                "window_end": window_end,
            },
        )

        logger.info(
            "Analysis saved: speaker='%s' score=%s sentiment=%s",
            speaker_name,
            analysis.get("performance_score"),
            analysis.get("sentiment"),
        )
        return {
            "status": "ok",
            "speaker": speaker_name,
            "score": analysis.get("performance_score"),
            "words_analysed": word_count,
        }

    except Exception as exc:
        logger.error("flush_single_speaker failed for '%s': %s", speaker_name, exc)
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        return {"status": "error", "error": str(exc)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Original tasks — UNCHANGED
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_meeting_pipeline(self, meeting_id: int):
    """Post-meeting pipeline — unchanged from original."""
    from meetings.models import Meeting, ActionItem, TranscriptChunk
    from meetings.services import RecallService, TranscriptionService, LLMService

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        logger.error("Meeting %d not found", meeting_id)
        return {"error": f"Meeting {meeting_id} not found"}

    logger.info("═══ Starting post-meeting pipeline for Meeting %d ═══", meeting_id)

    # Stop live buffer if still running
    buffer_manager.deactivate_meeting(meeting_id)

    meeting.status = Meeting.Status.PROCESSING
    meeting.save(update_fields=["status"])
    broadcast_to_meeting(meeting_id, "status_change", {"status": "processing"})

    try:
        transcript_text = _fetch_transcript(meeting)
        if not transcript_text:
            raise ValueError("Empty transcript — nothing to process")

        meeting.full_transcript = transcript_text
        meeting.save(update_fields=["full_transcript"])

        transcription_svc = TranscriptionService()
        chunks = transcription_svc.chunk_transcript(transcript_text)

        llm_svc = LLMService()
        chunk_results = []
        summary_language = getattr(meeting, "summary_language", "English")

        for chunk_data in chunks:
            processed = llm_svc.process_chunk(
                raw_text=chunk_data["text"],
                chunk_index=chunk_data["chunk_index"],
                summary_language=summary_language,
            )
            chunk_results.append(processed)

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

            broadcast_to_meeting(
                meeting_id,
                "transcript_chunk",
                {
                    "chunk_index": chunk_data["chunk_index"],
                    "summary": processed.get("summary", ""),
                    "key_decisions": processed.get("key_decisions", []),
                    "raw_text": chunk_data["text"],
                    "timestamp_start": chunk_data["start"],
                    "timestamp_end": chunk_data["end"],
                },
            )

            for item in processed.get("action_items", []):
                ai = ActionItem.objects.create(
                    meeting=meeting,
                    assigned_speaker=item.get("assigned_to", "Unassigned"),
                    task_description=item.get("task", ""),
                    deadline=item.get("deadline"),
                )
                broadcast_to_meeting(
                    meeting_id,
                    "action_item",
                    {
                        "id": ai.id,
                        "assigned_speaker": ai.assigned_speaker,
                        "task_description": ai.task_description,
                        "deadline": ai.deadline,
                    },
                )

        final_output = llm_svc.generate_final_summary(chunk_results, summary_language=summary_language)

        summary_parts = []
        if final_output.get("title"):
            meeting.title = final_output["title"]
        if final_output.get("executive_summary"):
            summary_parts.append(
                f"## Executive Summary\n{final_output['executive_summary']}"
            )
        if final_output.get("key_topics"):
            topics = "\n".join(f"- {t}" for t in final_output["key_topics"])
            summary_parts.append(f"## Key Topics\n{topics}")
        if final_output.get("detailed_summary"):
            summary_parts.append(
                f"## Detailed Summary\n{final_output['detailed_summary']}"
            )

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
        broadcast_to_meeting(
            meeting_id, "summary_update", {"summary": meeting.final_summary}
        )
        broadcast_to_meeting(
            meeting_id, "transcript_update", {"transcript": meeting.full_transcript, "title": meeting.title}
        )
        broadcast_to_meeting(meeting_id, "status_change", {"status": "completed"})

        logger.info("═══ Post-meeting pipeline complete for Meeting %d ═══", meeting_id)
        return {"meeting_id": meeting_id, "status": "completed"}

    except Exception as exc:
        logger.exception("Pipeline failed for meeting %d: %s", meeting_id, exc)
        meeting.status = Meeting.Status.FAILED
        meeting.save(update_fields=["status"])
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        return {"error": str(exc), "meeting_id": meeting_id}


@shared_task
def poll_live_transcript(meeting_id: int, bot_id: str, last_segment_index: int = 0):
    """
    Polls Recall.ai transcript every 15 seconds during live meeting.
    Since ap-northeast-1 doesn't support real-time webhooks,
    we poll instead and buffer new segments manually.
    """
    from meetings.models import Meeting, Speaker, LiveTranscriptSegment
    from meetings.services import RecallService
    from meetings.broadcast import broadcast_to_meeting

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return

    if meeting.status not in (Meeting.Status.IN_PROGRESS, Meeting.Status.BOT_JOINING):
        return

    try:
        recall_svc = RecallService()
        segments = recall_svc.get_transcript(bot_id)

        if not segments:
            poll_live_transcript.apply_async(
                args=[meeting_id, bot_id, last_segment_index], countdown=15
            )
            return

        # Only process NEW segments since last poll
        new_segments = segments[last_segment_index:]
        new_index = last_segment_index

        for seg in new_segments:
            speaker_name = seg.get("speaker", "Unknown")
            words = seg.get("words", [])
            text = seg.get("text", "").strip()
            
            if not text and words:
                text = " ".join(w.get("text", "") for w in words).strip()
                
            if not text:
                continue

            start_time = words[0].get("start_time", 0.0) if words else 0.0
            end_time = words[-1].get("end_time", 0.0) if words else 0.0

            # Get or create speaker
            speaker, created = Speaker.objects.get_or_create(
                meeting=meeting,
                recall_participant_id=speaker_name,
                defaults={"name": speaker_name},
            )

            if created:
                broadcast_to_meeting(
                    meeting_id,
                    "speaker_joined",
                    {
                        "speaker_id": speaker.id,
                        "speaker_name": speaker.name,
                        "meeting_id": meeting_id,
                    },
                )

            # Update speaker stats
            word_count_delta = len(text.split())
            Speaker.objects.filter(pk=speaker.id).update(
                word_count=speaker.word_count + word_count_delta,
                talk_time_seconds=speaker.talk_time_seconds
                + max(0, int(end_time - start_time)),
                is_speaking=True,
                last_quote=text[:200],
            )
            Speaker.objects.filter(meeting=meeting).exclude(pk=speaker.id).update(
                is_speaking=False
            )

            # Save segment
            LiveTranscriptSegment.objects.create(
                meeting=meeting,
                speaker=speaker,
                text=text,
                start_time=start_time,
                end_time=end_time,
                is_final=True,
            )

            # Buffer for Gemini analysis
            if buffer_manager.is_active(meeting_id):
                buffer_manager.append(
                    meeting_id=meeting_id,
                    speaker_id=speaker.id,
                    speaker_name=speaker.name,
                    text=text,
                    start_t=start_time,
                    end_t=end_time,
                )

            # Broadcast to dashboard
            speaker.refresh_from_db()
            broadcast_to_meeting(
                meeting_id,
                "transcript_segment",
                {
                    "speaker_id": speaker.id,
                    "speaker_name": speaker.name,
                    "text": text,
                    "start_time": start_time,
                    "end_time": end_time,
                    "is_final": True,
                    "word_count": speaker.word_count,
                    "talk_time_seconds": speaker.talk_time_seconds,
                },
            )

            new_index += 1
            logger.info("Live segment: [%s] %s", speaker_name, text[:60])

        # Poll again in 15 seconds
        poll_live_transcript.apply_async(
            args=[meeting_id, bot_id, new_index], countdown=15
        )

    except Exception as exc:
        logger.error("poll_live_transcript error: %s", exc)
        # Retry anyway
        poll_live_transcript.apply_async(
            args=[meeting_id, bot_id, last_segment_index], countdown=30
        )


@shared_task
def poll_bot_status(meeting_id: int):
    """Poll Recall.ai bot status — unchanged from original."""
    from meetings.models import Meeting
    from meetings.services import RecallService

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return

    if meeting.status in (Meeting.Status.COMPLETED, Meeting.Status.FAILED):
        return

    if not meeting.bot_id:
        return

    try:
        recall_svc = RecallService()
        bot_data = recall_svc.get_bot_status(meeting.bot_id)
        status_changes = bot_data.get("status_changes", [])

        if status_changes:
            latest_status = status_changes[-1].get("code", "")
            logger.info("Bot %s latest status: %s", meeting.bot_id, latest_status)

            if latest_status in ("in_call_recording", "in_call_not_recording"):
                if meeting.status != Meeting.Status.IN_PROGRESS:
                    meeting.status = Meeting.Status.IN_PROGRESS
                    meeting.save(update_fields=["status"])
                    buffer_manager.activate_meeting(meeting_id)
                    broadcast_to_meeting(meeting_id, "status_change", {"status": "in_progress"})

                    # ── Start live transcription polling ──────────────────
                    # Use Azure Speech if configured (better Urdu support),
                    # otherwise fall back to Gladia/Recall transcript polling.
                    if settings.AZURE_SPEECH_KEY:
                        logger.info("Starting Azure audio polling for meeting %d", meeting_id)
                        poll_audio_chunk.apply_async(
                            args=[meeting_id, meeting.bot_id, 0],
                            countdown=30,
                        )
                    else:
                        logger.info("Starting Gladia transcript polling for meeting %d", meeting_id)
                        poll_live_transcript.apply_async(
                            args=[meeting_id, meeting.bot_id, 0],
                            countdown=15,
                        )

            elif latest_status == "done":
                # ── Bot finished recording ─────────────────────────────────
                # Do NOT set meeting.status = PROCESSING here.
                # poll_audio_chunk may still be queued for its final Azure pass
                # (warmup detect + language lock). Setting PROCESSING now blocks
                # it — it sees 'processing' and exits in 0.045s before Azure runs.
                #
                # Strategy: keep status IN_PROGRESS, give poll_audio_chunk 90s
                # to complete its Azure run, then start post-meeting pipeline.
                # process_meeting_pipeline sets PROCESSING itself when it starts.
                broadcast_to_meeting(
                    meeting_id, "status_change", {"status": "processing"}
                )
                process_meeting_pipeline.apply_async(
                    args=[meeting_id],
                    countdown=90,   # 90s window for final Azure transcription
                )
                return

            elif latest_status in ("fatal", "analysis_failed"):
                meeting.status = Meeting.Status.FAILED
                meeting.save(update_fields=["status"])
                buffer_manager.deactivate_meeting(meeting_id)
                broadcast_to_meeting(meeting_id, "status_change", {"status": "failed"})
                return

        poll_bot_status.apply_async(args=[meeting_id], countdown=15)

    except Exception as exc:
        logger.error("Error polling bot status: %s", exc)
        poll_bot_status.apply_async(args=[meeting_id], countdown=60)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _fetch_transcript(meeting) -> str:
    from meetings.services import RecallService, TranscriptionService
    from meetings.models import LiveTranscriptSegment

    if not meeting.bot_id:
        return meeting.full_transcript

    recall_svc = RecallService()
    transcription_svc = TranscriptionService()

    # ── Attempt 1: Recall.ai transcript API ──
    try:
        segments = recall_svc.get_transcript(meeting.bot_id)
        if segments:
            transcript = transcription_svc.assemble_recall_transcript(segments)
            if transcript:
                return transcript
    except Exception as exc:
        logger.warning("Recall transcript fetch failed: %s", exc)

    # ── Attempt 2: Download recording + Whisper/Azure ──
    try:
        media_dir = os.path.join(settings.BASE_DIR, "media", "recordings")
        os.makedirs(media_dir, exist_ok=True)
        output_path = os.path.join(media_dir, f"meeting_{meeting.id}.mp4")

        if not os.path.exists(output_path) or os.path.getsize(output_path) < 1000:
            recording_url = recall_svc.get_recording_url(meeting.bot_id)
            if recording_url:
                recall_svc.download_recording(recording_url, output_path)
            else:
                logger.warning("No recording URL available for meeting %d", meeting.id)
                raise ValueError("No recording URL")
        else:
            logger.info("Using existing recording file: %s", output_path)

        transcript = transcription_svc.transcribe_audio(
            output_path,
            live_language=getattr(meeting, "live_language", "English")
        )
        if transcript:
            try:
                os.remove(output_path)
            except OSError:
                pass
            return transcript
    except Exception as exc:
        logger.warning("Recording transcription failed: %s", exc)

    # ── Attempt 3: Assemble from LiveTranscriptSegments already in DB ──
    live_segments = LiveTranscriptSegment.objects.filter(
        meeting=meeting
    ).select_related("speaker").order_by("start_time")

    if live_segments.exists():
        logger.info(
            "Assembling transcript from %d live segments for meeting %d",
            live_segments.count(), meeting.id
        )
        lines = []
        for seg in live_segments:
            speaker = seg.speaker.name if seg.speaker else "Unknown"
            lines.append(f"[{speaker}]: {seg.text}")
        return "\n".join(lines)

    return meeting.full_transcript


def _fmt_time(seconds: float) -> str:
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


@shared_task
def process_live_chunks():
    """
    Runs every 1 minute via Celery Beat.
    Groups live transcript segments into 1-minute chunks, runs the LLM, and creates TranscriptChunks and ActionItems.
    """
    from meetings.models import Meeting, LiveTranscriptSegment, TranscriptChunk, ActionItem
    from meetings.services import LLMService
    from meetings.broadcast import broadcast_to_meeting
    
    active_meetings = Meeting.objects.filter(status__in=[Meeting.Status.IN_PROGRESS, Meeting.Status.BOT_JOINING])
    llm_svc = LLMService()
    
    for meeting in active_meetings:
        CHUNK_SIZE = 60.0
        last_chunk = TranscriptChunk.objects.filter(meeting=meeting).order_by("-chunk_index").first()
        next_chunk_index = last_chunk.chunk_index + 1 if last_chunk else 0
        
        start_time = next_chunk_index * CHUNK_SIZE
        end_time = start_time + CHUNK_SIZE
        
        segments = LiveTranscriptSegment.objects.filter(
            meeting=meeting,
            start_time__gte=start_time,
            start_time__lt=end_time
        ).order_by("start_time")
        
        if not segments.exists():
            continue
            
        # Ensure we don't process a chunk that hasn't fully completed yet
        latest_segment = LiveTranscriptSegment.objects.filter(meeting=meeting).order_by("-start_time").first()
        if latest_segment and latest_segment.start_time < end_time:
            continue
            
        raw_text = " ".join(f"[{s.speaker.name if s.speaker else 'Unknown'}]: {s.text}" for s in segments)
        
        try:
            processed = llm_svc.process_chunk(
                raw_text=raw_text,
                chunk_index=next_chunk_index,
                summary_language=getattr(meeting, "summary_language", "English"),
            )
            
            chunk, _ = TranscriptChunk.objects.update_or_create(
                meeting=meeting,
                chunk_index=next_chunk_index,
                defaults={
                    "raw_text": raw_text,
                    "processed_json": processed,
                    "timestamp_start": start_time,
                    "timestamp_end": end_time,
                },
            )
            
            broadcast_to_meeting(
                meeting.id,
                "transcript_chunk",
                {
                    "chunk_index": chunk.chunk_index,
                    "summary": processed.get("summary", ""),
                },
            )
            
            for item in processed.get("action_items", []):
                ai = ActionItem.objects.create(
                    meeting=meeting,
                    assigned_speaker=item.get("assigned_to", "Unassigned"),
                    task_description=item.get("task", ""),
                    deadline=item.get("deadline"),
                )
                broadcast_to_meeting(
                    meeting.id,
                    "action_item",
                    {
                        "id": ai.id,
                        "assigned_speaker": ai.assigned_speaker,
                        "task_description": ai.task_description,
                        "deadline": ai.deadline,
                    },
                )
        except Exception as exc:
            logger.error("process_live_chunks failed for meeting %d: %s", meeting.id, exc)

@shared_task
def poll_audio_chunk(meeting_id: int, bot_id: str, last_segment_count: int = 0):
    """
    Every 30 seconds during a live meeting:
    1. Download the latest recording from Recall.ai
    2. Send the FULL audio to Azure Speech (it's the only option — Recall gives one URL)
    3. Azure returns ALL segments from the start of the meeting
    4. We skip segments we've already processed (tracked by last_segment_count)
    5. Only NEW segments get saved to DB, buffered, and broadcast

    The `last_segment_count` parameter tracks how many Azure segments we've already
    processed so we don't create duplicate LiveTranscriptSegment rows.
    """
    from django.db.models import F
    from meetings.models import Meeting, Speaker, LiveTranscriptSegment
    from meetings.services.recall_service import RecallService
    from meetings.services.azure_speech import AzureSpeechService
    from meetings.broadcast import broadcast_to_meeting
    from meetings.transcript_buffer import buffer_manager

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return

    # Stop if meeting ended
    if meeting.status not in (Meeting.Status.IN_PROGRESS, Meeting.Status.BOT_JOINING):
        logger.info("poll_audio_chunk: meeting %d status=%s, stopping", meeting_id, meeting.status)
        return

    try:
        # ── Get recording URL from Recall.ai ─────────────────────────────────
        recall_svc = RecallService()
        bot_data = recall_svc.get_bot_status(bot_id)
        recordings = bot_data.get("recordings", [])

        if not recordings:
            # No recording yet — try again in 30s
            poll_audio_chunk.apply_async(
                args=[meeting_id, bot_id, last_segment_count],
                countdown=30,
            )
            return

        # Get download URL
        recording_url = None
        for rec in recordings:
            media = rec.get("media_shortcuts", {})
            url = media.get("video_mixed", {}).get("data", {}).get("download_url")
            if url:
                recording_url = url
                break

        if not recording_url:
            poll_audio_chunk.apply_async(
                args=[meeting_id, bot_id, last_segment_count],
                countdown=30,
            )
            return

        # ── Load hint phrases / skip config from meeting's transcription_mode ──
        hint_phrases       = []
        skip_warmup_secs   = 0.0
        detect_languages   = ["ur-PK", "en-US"]   # Urdu + English code-switching
        transcription_mode = getattr(meeting, 'transcription_mode', 'auto')

        # ← ALWAYS VISIBLE: tells us exactly what's in the DB for this meeting
        logger.info(
            "poll_audio_chunk: meeting %d → transcription_mode='%s'",
            meeting_id, transcription_mode,
        )

        if transcription_mode == 'hints':
            # Load AI-generated hint phrases from the meeting owner's language profile
            try:
                from accounts.models import UserLanguageProfile
                profile = UserLanguageProfile.objects.get(user=meeting.user)
                hint_phrases = profile.hint_phrases or []
                # Use the user's actual language pair for auto-detect
                detect_languages = [profile.primary_language, "en-US"]
                logger.info(
                    "poll_audio_chunk: hints mode — %d phrases, langs=%s, meeting %d",
                    len(hint_phrases), detect_languages, meeting_id,
                )
            except Exception as e:
                logger.warning("Could not load language profile for meeting %d: %s", meeting_id, e)

        elif transcription_mode == 'skip':
            # 8-second warm-up: Azure hears real speech to auto-detect language,
            # then we discard those first 8s and capture from second 9 onwards
            skip_warmup_secs = 8.0
            logger.info("poll_audio_chunk: skip-warmup mode (%.0fs) for meeting %d", skip_warmup_secs, meeting_id)

        azure_svc = AzureSpeechService()
        result = azure_svc.transcribe_from_url(
            recording_url,
            hint_phrases=hint_phrases,
            skip_warmup_seconds=skip_warmup_secs,
            detect_languages=detect_languages,
        )

        all_segments = result.get("segments", [])
        total_segments = len(all_segments)

        if total_segments <= last_segment_count:
            # No new segments — try again in 30s
            logger.debug("poll_audio_chunk: no new segments (%d <= %d)", total_segments, last_segment_count)
            poll_audio_chunk.apply_async(
                args=[meeting_id, bot_id, last_segment_count],
                countdown=30,
            )
            return

        # Only process segments we haven't seen yet
        new_segments = all_segments[last_segment_count:]
        logger.info(
            "poll_audio_chunk: meeting=%d total=%d new=%d (skipped %d already processed)",
            meeting_id, total_segments, len(new_segments), last_segment_count,
        )

        # ── Process each NEW segment ─────────────────────────────────────────
        for segment in new_segments:
            speaker_name = segment.get("speaker", "Unknown")
            text = segment.get("text", "").strip()
            start_time = segment.get("start", 0)
            end_time = segment.get("end", 0)

            if not text:
                continue

            # Get or create speaker
            speaker, created = Speaker.objects.get_or_create(
                meeting=meeting,
                recall_participant_id=speaker_name,
                defaults={"name": speaker_name},
            )

            if created:
                broadcast_to_meeting(meeting_id, "speaker_joined", {
                    "speaker_id": speaker.id,
                    "speaker_name": speaker.name,
                })

            # Update speaker stats atomically (avoid stale ORM reads)
            word_delta = len(text.split())
            time_delta = max(0, int(end_time - start_time))

            Speaker.objects.filter(pk=speaker.id).update(
                word_count=F("word_count") + word_delta,
                talk_time_seconds=F("talk_time_seconds") + time_delta,
                is_speaking=True,
                last_quote=text[:200],
            )

            # Save segment to DB
            LiveTranscriptSegment.objects.create(
                meeting=meeting,
                speaker=speaker,
                text=text,
                start_time=start_time,
                end_time=end_time,
                is_final=True,
            )

            # Buffer for Gemini 1-min analysis
            if buffer_manager.is_active(meeting_id):
                buffer_manager.append(
                    meeting_id=meeting_id,
                    speaker_id=speaker.id,
                    speaker_name=speaker.name,
                    text=text,
                    start_t=start_time,
                    end_t=end_time,
                )

            # Push to dashboard live feed
            speaker.refresh_from_db()
            broadcast_to_meeting(meeting_id, "transcript_segment", {
                "speaker_id": speaker.id,
                "speaker_name": speaker.name,
                "text": text,
                "start_time": start_time,
                "end_time": end_time,
                "is_final": True,
                "language": segment.get("language", "unknown"),
                "word_count": speaker.word_count,
                "talk_time_seconds": speaker.talk_time_seconds,
            })

            logger.info(
                "Azure segment [%s][%s]: %s",
                segment.get("language", "?"),
                speaker_name,
                text[:60],
            )

        # ── Schedule next poll ────────────────────────────────────────────────
        poll_audio_chunk.apply_async(
            args=[meeting_id, bot_id, total_segments],
            countdown=30,
        )

    except Exception as exc:
        logger.error("poll_audio_chunk error for meeting %d: %s", meeting_id, exc)
        # Retry with same segment count (don't skip anything on error)
        poll_audio_chunk.apply_async(
            args=[meeting_id, bot_id, last_segment_count],
            countdown=30,
        )