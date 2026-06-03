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
# Async bot join — runs the blocking Recall.ai API call off the request thread
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@shared_task(bind=True, max_retries=1, default_retry_delay=5)
def dispatch_bot_join(self, meeting_id: int, live_language: str = "English"):
    """
    Fire-and-forget task that makes the blocking Recall.ai create_bot API call.
    The view has already set status=BOT_JOINING and returned to the frontend.
    On success: saves bot_id and starts poll_bot_status.
    On failure: sets status=FAILED and broadcasts to frontend.
    """
    from meetings.models import Meeting
    from meetings.services import RecallService, RecallServiceError

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return {"error": "Meeting not found"}

    # Guard: only proceed if still BOT_JOINING (user may have cancelled)
    if meeting.status != Meeting.Status.BOT_JOINING:
        logger.info("dispatch_bot_join: meeting %d status=%s, aborting", meeting_id, meeting.status)
        return {"status": "aborted"}

    try:
        recall_svc = RecallService()
        bot_data = recall_svc.create_bot(
            meeting_url=meeting.meeting_url,
            bot_name="Meeting Intel",
            live_language=live_language,
        )

        bot_id = bot_data.get("id", "")
        if not bot_id:
            raise RecallServiceError("Recall.ai returned no bot ID")

        meeting.bot_id = bot_id
        meeting.save(update_fields=["bot_id"])

        logger.info("dispatch_bot_join: bot %s created for meeting %d", bot_id, meeting_id)

        # Start polling for bot status transitions (joining → recording → done)
        poll_bot_status.apply_async(args=[meeting_id], countdown=10)

        return {"status": "ok", "bot_id": bot_id}

    except (RecallServiceError, Exception) as exc:
        logger.error("dispatch_bot_join FAILED for meeting %d: %s", meeting_id, exc)

        # Mark meeting as failed so the UI updates
        meeting.status = Meeting.Status.FAILED
        meeting.save(update_fields=["status"])
        broadcast_to_meeting(meeting_id, "status_change", {"status": "failed"})

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)

        return {"status": "error", "error": str(exc)}


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Original tasks
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def process_meeting_pipeline(self, meeting_id: int):
    """Post-meeting pipeline — unchanged from original."""
    from meetings.models import Meeting, ActionItem, TranscriptChunk, Speaker
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
                # Resolve Speaker FK using the assigned_speaker_id from LLM
                speaker_obj = None
                speaker_id = item.get("assigned_speaker_id")
                if speaker_id:
                    speaker_obj = Speaker.objects.filter(
                        id=speaker_id, meeting=meeting
                    ).first()

                ai = ActionItem.objects.create(
                    meeting=meeting,
                    assigned_speaker=item.get("assigned_to", "Unassigned"),
                    task_description=item.get("task", ""),
                    deadline=item.get("deadline"),
                    speaker=speaker_obj,
                )
                broadcast_to_meeting(
                    meeting_id,
                    "action_item",
                    {
                        "id": ai.id,
                        "assigned_speaker": ai.assigned_speaker,
                        "task_description": ai.task_description,
                        "deadline": ai.deadline,
                        "speaker_id": speaker_obj.id if speaker_obj else None,
                        "notification_sent": False,
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

        # Create action items from the final consolidated list too
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

        # ── Trigger async notification distribution ──
        distribute_action_items.apply_async(args=[meeting_id], countdown=5)

        # ── Compute per-participant scores for profile pages ──
        compute_participant_scores.apply_async(args=[meeting_id], countdown=10)

        logger.info("═══ Post-meeting pipeline complete for Meeting %d ═══", meeting_id)
        return {"meeting_id": meeting_id, "status": "completed"}

    except Exception as exc:
        logger.exception("Pipeline failed for meeting %d: %s", meeting_id, exc)
        meeting.status = Meeting.Status.FAILED
        meeting.save(update_fields=["status"])
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        return {"error": str(exc), "meeting_id": meeting_id}


@shared_task(bind=True, max_retries=2, default_retry_delay=30)
def distribute_action_items(self, meeting_id: int):
    """
    Post-meeting task: Groups action items by speaker and sends
    notifications via Email and/or Slack.
    Runs asynchronously so notification failures don't affect the pipeline.
    """
    from meetings.models import Meeting, ActionItem, Speaker, TeamDirectory
    from meetings.services.notification_service import NotificationService
    from django.utils import timezone
    from collections import defaultdict

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        logger.error("distribute_action_items: Meeting %d not found", meeting_id)
        return

    action_items = ActionItem.objects.filter(
        meeting=meeting, notification_sent=False
    ).select_related("speaker")

    if not action_items.exists():
        logger.info("No unsent action items for meeting %d", meeting_id)
        return

    # Group action items by speaker
    grouped = defaultdict(list)
    for ai in action_items:
        key = ai.speaker_id or ai.assigned_speaker
        grouped[key].append(ai)

    notification_svc = NotificationService()
    results = {"email_sent": 0, "slack_sent": 0, "skipped": 0}

    for speaker_key, items in grouped.items():
        # Resolve contact info
        email = ""
        slack_id = ""
        speaker_name = items[0].assigned_speaker

        if isinstance(speaker_key, int):
            # We have a Speaker FK — check email on the Speaker record
            speaker = Speaker.objects.filter(id=speaker_key).first()
            if speaker:
                speaker_name = speaker.name
                email = speaker.email or ""

        # Fallback: look up in TeamDirectory (fuzzy match)
        # Transcription providers often mangle names (e.g. "Slaxky" → "Slasky"),
        # so we use similarity matching instead of exact match.
        if not email or not slack_id:
            from difflib import SequenceMatcher

            directory_entry = None

            # Try exact match first (fastest)
            directory_entry = TeamDirectory.objects.filter(
                user=meeting.user,
                name__iexact=speaker_name,
            ).first()

            # If no exact match, try fuzzy match
            if not directory_entry and speaker_name:
                all_entries = TeamDirectory.objects.filter(user=meeting.user)
                best_match = None
                best_ratio = 0.0

                speaker_lower = speaker_name.lower().strip()

                for entry in all_entries:
                    entry_lower = entry.name.lower().strip()

                    # Check contains match (e.g. "Slaxky" in "Muhammad Slaxky")
                    if speaker_lower in entry_lower or entry_lower in speaker_lower:
                        best_match = entry
                        best_ratio = 1.0
                        break

                    # Fuzzy similarity
                    ratio = SequenceMatcher(None, speaker_lower, entry_lower).ratio()
                    if ratio > best_ratio:
                        best_ratio = ratio
                        best_match = entry

                # Accept if similarity >= 60%
                if best_match and best_ratio >= 0.6:
                    directory_entry = best_match
                    logger.info(
                        "Fuzzy matched '%s' → '%s' (%.0f%% similarity)",
                        speaker_name, best_match.name, best_ratio * 100,
                    )

            if directory_entry:
                email = email or directory_entry.email
                slack_id = slack_id or directory_entry.slack_id

        if not email and not slack_id:
            logger.info(
                "No contact info for '%s' (meeting %d) — skipping",
                speaker_name, meeting_id
            )
            results["skipped"] += len(items)
            continue

        # Build the items payload
        items_payload = [
            {
                "task": ai.task_description,
                "deadline": ai.deadline or "",
            }
            for ai in items
        ]

        # Send Email
        if email:
            success = notification_svc.send_email_action_items(
                email=email,
                speaker_name=speaker_name,
                action_items=items_payload,
                meeting_title=meeting.title or "Untitled Meeting",
                meeting_date=meeting.date,
            )
            if success:
                results["email_sent"] += len(items)

        # Send Slack
        if slack_id:
            success = notification_svc.send_slack_action_items(
                slack_id=slack_id,
                speaker_name=speaker_name,
                action_items=items_payload,
                meeting_title=meeting.title or "Untitled Meeting",
                meeting_date=meeting.date,
            )
            if success:
                results["slack_sent"] += len(items)

        # Mark as sent if either channel succeeded
        if (email and results["email_sent"]) or (slack_id and results["slack_sent"]):
            now = timezone.now()
            for ai in items:
                ai.notification_sent = True
                ai.notification_sent_at = now
            ActionItem.objects.bulk_update(
                items, ["notification_sent", "notification_sent_at"]
            )

            # Broadcast notification status to frontend
            for ai in items:
                broadcast_to_meeting(
                    meeting_id,
                    "notification_update",
                    {
                        "action_item_id": ai.id,
                        "notification_sent": True,
                    },
                )

    logger.info(
        "Action item distribution for meeting %d: %s", meeting_id, results
    )


@shared_task
def compute_participant_scores(meeting_id: int):
    """
    After meeting completes: match speakers to TeamDirectory users,
    compute per-meeting performance scores & sentiment breakdowns,
    and create UserMeetingScore records — ALL in a single DB transaction,
    then broadcast ONE batch event to the frontend.
    """
    from django.db import transaction
    from meetings.models import Meeting, Speaker, SpeakerAnalysis, TeamDirectory, UserMeetingScore

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return

    speakers = Speaker.objects.filter(meeting=meeting)
    if not speakers.exists():
        logger.info("compute_participant_scores: no speakers for meeting %d", meeting_id)
        return

    # Get all team directory entries for this user
    directory = TeamDirectory.objects.filter(user=meeting.user)
    if not directory.exists():
        logger.info("compute_participant_scores: empty directory for user %s", meeting.user)
        return

    # Build name lookup: lowercase normalized → TeamDirectory entry
    dir_lookup = {}
    for entry in directory:
        dir_lookup[entry.name.strip().lower()] = entry
        parts = entry.name.strip().split()
        if len(parts) > 1:
            dir_lookup[parts[0].lower()] = entry

    # ── Phase 1: Compute ALL scores first (no DB writes yet) ──
    batch_results = []
    for speaker in speakers:
        team_member = _match_speaker_to_directory(speaker.name, dir_lookup)
        if not team_member:
            logger.debug("No directory match for speaker '%s'", speaker.name)
            continue

        analyses = SpeakerAnalysis.objects.filter(meeting=meeting, speaker=speaker)

        if analyses.exists():
            scores = [a.performance_score for a in analyses if a.performance_score is not None]
            avg_score = sum(scores) / len(scores) if scores else 0
            sent_pos = analyses.filter(sentiment="positive").count()
            sent_neu = analyses.filter(sentiment="neutral").count()
            sent_neg = analyses.filter(sentiment="negative").count()
            summaries = [a.summary for a in analyses if a.summary]
            contribution = " ".join(summaries)[:500]
        else:
            avg_score = speaker.performance_score or 0
            sent_pos = 1 if speaker.sentiment == "positive" else 0
            sent_neu = 1 if speaker.sentiment == "neutral" else 0
            sent_neg = 1 if speaker.sentiment == "negative" else 0
            contribution = speaker.last_quote or ""

        batch_results.append({
            "team_member": team_member,
            "speaker": speaker,
            "score_data": {
                "performance_score": round(avg_score, 1),
                "sentiment_positive": sent_pos,
                "sentiment_neutral": sent_neu,
                "sentiment_negative": sent_neg,
                "contribution_summary": contribution,
                "word_count": speaker.word_count,
                "talk_time_seconds": speaker.talk_time_seconds,
                "meeting_date": meeting.date,
            },
        })

    if not batch_results:
        logger.info("compute_participant_scores: 0 speakers matched for meeting %d", meeting_id)
        return

    # ── Phase 2: Write ALL scores in a single atomic transaction ──
    with transaction.atomic():
        for entry in batch_results:
            UserMeetingScore.objects.update_or_create(
                team_member=entry["team_member"],
                meeting=meeting,
                defaults=entry["score_data"],
            )

    logger.info(
        "compute_participant_scores: %d speakers scored atomically for meeting %d",
        len(batch_results), meeting_id,
    )

    # ── Phase 3: Broadcast ONE batch event with all participant scores ──
    broadcast_payload = []
    for entry in batch_results:
        sd = entry["score_data"]
        # Determine dominant sentiment
        sents = {"positive": sd["sentiment_positive"], "neutral": sd["sentiment_neutral"], "concern": sd["sentiment_negative"]}
        dominant = max(sents, key=sents.get) if any(sents.values()) else "neutral"

        broadcast_payload.append({
            "speaker_id": entry["speaker"].id,
            "speaker_name": entry["speaker"].name,
            "team_member_id": entry["team_member"].id,
            "team_member_name": entry["team_member"].name,
            "performance_score": sd["performance_score"],
            "sentiment_positive": sd["sentiment_positive"],
            "sentiment_neutral": sd["sentiment_neutral"],
            "sentiment_negative": sd["sentiment_negative"],
            "dominant_sentiment": dominant,
            "word_count": sd["word_count"],
            "talk_time_seconds": sd["talk_time_seconds"],
            "contribution_summary": sd["contribution_summary"],
        })

    broadcast_to_meeting(meeting_id, "participant_scores_batch", {
        "participants": broadcast_payload,
        "total_matched": len(broadcast_payload),
    })

    logger.info(
        "compute_participant_scores: batch broadcast sent for meeting %d (%d participants)",
        meeting_id, len(broadcast_payload),
    )


def _match_speaker_to_directory(speaker_name: str, dir_lookup: dict):
    """
    Match a speaker's display name to a TeamDirectory entry.
    Handles: exact match, case-insensitive, first-name, bracket-stripped.
    """
    name = speaker_name.strip()

    # Strip bracketed suffixes like "Muhammad Umer [slack:U123]"
    import re
    clean_name = re.sub(r'\s*\[.*?\]\s*', '', name).strip()

    # 1. Exact match (case-insensitive)
    if clean_name.lower() in dir_lookup:
        return dir_lookup[clean_name.lower()]

    # 2. Try first name only
    first = clean_name.split()[0].lower() if clean_name else ""
    if first and first in dir_lookup:
        return dir_lookup[first]

    # 3. Try substring match (speaker name contains directory name or vice versa)
    for key, entry in dir_lookup.items():
        if key in clean_name.lower() or clean_name.lower() in key:
            return entry

    return None


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
    """Poll Recall.ai bot status until meeting ends."""
    from meetings.models import Meeting
    from meetings.services import RecallService

    try:
        meeting = Meeting.objects.get(pk=meeting_id)
    except Meeting.DoesNotExist:
        return

    # ── Stop polling if meeting has already moved past live ──
    # PROCESSING means end-bot was clicked or 'done' was already handled.
    if meeting.status in (Meeting.Status.COMPLETED, Meeting.Status.FAILED, Meeting.Status.PROCESSING):
        logger.info("poll_bot_status: meeting %d status=%s, stopping poll", meeting_id, meeting.status)
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
                    # Gladia webhooks power the live dashboard in real-time.
                    # Azure runs post-meeting on the final MP4 for superior accuracy.
                    logger.info("Starting Gladia live transcript polling for meeting %d", meeting_id)
                    poll_live_transcript.apply_async(
                        args=[meeting_id, meeting.bot_id, 0],
                        countdown=15,
                    )

            elif latest_status == "done":
                # ── Bot finished recording ─────────────────────────────────
                # Re-read from DB to check if end_bot already set PROCESSING
                meeting.refresh_from_db()
                if meeting.status == Meeting.Status.PROCESSING:
                    # end_bot already handled this — don't schedule a duplicate pipeline
                    logger.info("poll_bot_status: meeting %d already PROCESSING (end-bot), skipping duplicate pipeline", meeting_id)
                    return

                meeting.status = Meeting.Status.PROCESSING
                meeting.save(update_fields=["status"])
                buffer_manager.deactivate_meeting(meeting_id)
                broadcast_to_meeting(
                    meeting_id, "status_change", {"status": "processing"}
                )
                process_meeting_pipeline.apply_async(
                    args=[meeting_id],
                    countdown=30,
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

    # ── Attempt 1: Use LiveTranscriptSegments already in DB ──
    # These were captured in real-time via Deepgram Nova-3 webhooks.
    # Deepgram provides high-quality transcription with speaker labels,
    # so these are always the preferred source for the post-meeting transcript.
    live_segments = LiveTranscriptSegment.objects.filter(
        meeting=meeting
    ).select_related("speaker").order_by("start_time")

    if live_segments.exists():
        logger.info(
            "Assembling transcript from %d Deepgram live segments for meeting %d",
            live_segments.count(), meeting.id
        )
        lines = []
        for seg in live_segments:
            if seg.speaker:
                speaker_label = seg.speaker.name
            else:
                speaker_label = "Unknown"
            lines.append(f"[{speaker_label}]: {seg.text}")
        return "\n".join(lines)

    recall_svc = RecallService()
    transcription_svc = TranscriptionService()

    # ── Attempt 2: Recall.ai transcript API ──
    try:
        segments = recall_svc.get_transcript(meeting.bot_id)
        if segments:
            transcript = transcription_svc.assemble_recall_transcript(segments)
            if transcript:
                return transcript
    except Exception as exc:
        logger.warning("Recall transcript fetch failed: %s", exc)

    # ── Attempt 3: Download recording + Whisper/Azure ──
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
        recording_url = recall_svc.get_recording_url(bot_id)

        if not recording_url:
            logger.warning("poll_audio_chunk: no recording_url yet for meeting %d, retrying in 30s", meeting_id)
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