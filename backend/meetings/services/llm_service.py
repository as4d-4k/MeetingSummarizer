"""
meetings/services/llm_service.py  — FULL REPLACEMENT
------------------------------------------------------
Changes from original:
  - Added SpeakerWindowOutput Pydantic schema
  - Added analyse_speaker_window() method — the core of the live system
  - All original methods (process_chunk, generate_final_summary) unchanged
"""

import json
import logging
import time
from typing import Optional

from pydantic import BaseModel, Field
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from django.conf import settings

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pydantic schemas
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class ActionItemOutput(BaseModel):
    assigned_to: str = Field(description="Name of the person assigned this task")
    assigned_speaker_id: Optional[int] = Field(default=None, description="The database ID of the speaker if known. Usually not available from transcript alone.")
    task: str = Field(description="Clear description of the task in English")
    deadline: Optional[str] = Field(default=None, description="Deadline if mentioned")


class ChunkProcessingOutput(BaseModel):
    english_translation: str = Field(
        description="Full English translation of the chunk"
    )
    summary: str = Field(description="Concise summary of this chunk (2-3 sentences)")
    key_decisions: list[str] = Field(default_factory=list)
    action_items: list[ActionItemOutput] = Field(default_factory=list)
    speakers_identified: list[str] = Field(default_factory=list)


class FinalSummaryOutput(BaseModel):
    title: str = Field(description="Auto-generated meeting title")
    executive_summary: str = Field(description="Executive summary (3-5 sentences)")
    key_topics: list[str] = Field(description="Main topics discussed")
    detailed_summary: str = Field(
        description="Detailed summary of all important points"
    )
    overall_action_items: list[ActionItemOutput] = Field(
        description="Consolidated action items"
    )


# ── NEW: Live per-speaker window analysis ─────────────────────────────────────


class EngagementSignals(BaseModel):
    asks_questions: bool = Field(description="Did the speaker ask questions?")
    provides_data: bool = Field(description="Did they cite data, numbers, or evidence?")
    actionable_commitments: bool = Field(
        description="Did they commit to specific actions?"
    )
    off_topic: bool = Field(description="Did they go off-topic or ramble?")


class SpeakerWindowOutput(BaseModel):
    """
    Structured output from analysing a single speaker's 1-minute window.
    This powers the live admin dashboard cards.
    """

    sentiment: str = Field(description="One of: positive, neutral, negative")
    performance_score: int = Field(
        description="Score from 0-100 based on engagement and contribution"
    )
    summary: str = Field(
        description="1-2 sentence summary of what this speaker said in this window"
    )
    key_points: list[str] = Field(
        default_factory=list, description="Up to 4 key points made by this speaker"
    )
    topic_coverage: dict = Field(
        default_factory=dict,
        description="Dict of target_topic -> coverage fraction 0.0-1.0. Only include topics actually discussed.",
    )
    engagement_signals: EngagementSignals
    one_line_quote: str = Field(
        description="Most notable thing they said, max 120 chars"
    )
    english_translation: str = Field(
        description="Full English translation if Urdu/mixed, else the original text"
    )


class LLMServiceError(Exception):
    pass


class LLMService:
    """LLM-powered meeting transcript processor."""

    def __init__(self, temperature: float = 0.1):
        self.llm = self._init_llm(temperature)

    def _init_llm(self, temperature: float):
        openai_key = getattr(settings, "OPENAI_API_KEY", "")
        if not openai_key:
            raise LLMServiceError("No LLM API key configured. Set OPENAI_API_KEY in .env.")

        from langchain_openai import ChatOpenAI
        logger.info("Using OpenAI gpt-4o-mini")
        return ChatOpenAI(
            model="gpt-4o-mini",
            temperature=temperature,
            api_key=openai_key,
            max_tokens=4096,
        )

    # ──────────────────────────────────────────────
    # NEW: Live per-speaker 1-minute window analysis
    # ──────────────────────────────────────────────
    def analyse_speaker_window(
        self,
        speaker_name: str,
        transcript_text: str,
        target_topics: list[str],
        window_start: float,
        window_end: float,
        previous_summary: str = "",
        live_language: str = "English",
    ) -> dict:
        """
        Analyse a single speaker's 1-minute transcript window during a LIVE meeting.

        This is the core of the real-time system. It is called by the Celery task
        `flush_speaker_buffers` every 1 minute per speaker.

        Args:
            speaker_name:     Display name of the speaker.
            transcript_text:  Their buffered speech for this window (may be Urdu/English mix).
            target_topics:    List of topics the admin set for this meeting.
            window_start:     Seconds from meeting start (for context).
            window_end:       Seconds from meeting start.
            previous_summary: The speaker's summary from the previous window (used for cumulative update).

        Returns:
            dict matching SpeakerWindowOutput schema.
        """
        parser = JsonOutputParser(pydantic_object=SpeakerWindowOutput)

        topics_str = (
            ", ".join(target_topics) if target_topics else "general business discussion"
        )
        window_label = f"{_fmt_time(window_start)} → {_fmt_time(window_end)}"

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    (
                        "You are an expert multilingual meeting analyst specialising in business meetings "
                        "where participants may switch between Urdu and English (Roman Urdu or script). "
                        "Your job is to analyse a single speaker's contribution during a 1-minute window "
                        "of a live meeting and return a structured JSON performance assessment.\n\n"
                        "SCORING GUIDE (performance_score 0-100):\n"
                        "  90-100: Highly engaged — data-driven, clear decisions, actionable commitments, moves meeting forward\n"
                        "  70-89:  Good — relevant contributions, mostly on-topic, some concrete points\n"
                        "  50-69:  Average — present but vague, few concrete ideas\n"
                        "  30-49:  Low — minimal contribution, mostly passive\n"
                        "  0-29:   Very low — off-topic, irrelevant, or near-silent\n\n"
                        "SENTIMENT:\n"
                        "  positive → constructive, forward-looking, solution-oriented\n"
                        "  neutral  → factual, balanced, informational\n"
                        "  negative → complaints, blockers, frustration, disagreement\n\n"
                        "IMPORTANT: The 'summary' field MUST be a CUMULATIVE summary of what the speaker has said so far. "
                        "Merge the 'Previous Summary' with the new points from this window. Keep it concise (max 2 clear lines). "
                        "OUTPUT LANGUAGE RULE — STRICTLY FOLLOW THIS: "
                        "ALL text outputs (summary, key_points, one_line_quote) MUST be written in ENGLISH. "
                        "Even if the transcript is in Urdu, Roman Urdu, or any other language, you MUST translate "
                        "and write the summary, key_points, and one_line_quote in clear, professional English. "
                        "NEVER output Roman Urdu or Urdu script in these fields — always English.\n\n"
                        "Return ONLY valid JSON. No markdown. No explanation.\n\n"
                        "{format_instructions}"
                    ),
                ),
                (
                    "human",
                    (
                        "Speaker: {speaker_name}\n"
                        "Meeting window: {window_label}\n"
                        "Target topics for this meeting: {topics}\n"
                        "Previous Summary: {previous_summary}\n\n"
                        "Transcript (last 1 minute of this speaker):\n"
                        "---\n{transcript}\n---\n\n"
                        "Analyse and return JSON."
                    ),
                ),
            ]
        )

        chain = prompt | self.llm | parser

        logger.info(
            "Analysing speaker '%s' window %s (%d words)",
            speaker_name,
            window_label,
            len(transcript_text.split()),
        )

        for attempt in range(3):
            try:
                result = chain.invoke(
                    {
                        "speaker_name": speaker_name,
                        "window_label": window_label,
                        "topics": topics_str,
                        "live_language": live_language,
                        "previous_summary": previous_summary or "None",
                        "transcript": transcript_text,
                        "format_instructions": parser.get_format_instructions(),
                    }
                )
                logger.info(
                    "Speaker '%s' analysis done: score=%s sentiment=%s",
                    speaker_name,
                    result.get("performance_score"),
                    result.get("sentiment"),
                )
                return result

            except Exception as exc:
                if "429" in str(exc) and attempt < 2:
                    wait = 20 * (attempt + 1)
                    logger.warning("Rate limited, retrying in %ds...", wait)
                    time.sleep(wait)
                    continue
                logger.error(
                    "Speaker window analysis failed for '%s': %s", speaker_name, exc
                )
                # Return a safe fallback instead of crashing
                return _fallback_analysis(speaker_name, transcript_text)

    # ──────────────────────────────────────────────
    # Original: Process a single transcript chunk (post-meeting)
    # ──────────────────────────────────────────────
    def process_chunk(self, raw_text: str, chunk_index: int = 0, summary_language: str = "English") -> dict:
        parser = JsonOutputParser(pydantic_object=ChunkProcessingOutput)

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    (
                        "You are an expert multilingual meeting analyst. You specialize in "
                        "processing meeting transcripts that contain a mix of Urdu and English "
                        "(code-switching). Your job is to:\n"
                        "1. Translate ALL content into clear, professional ENGLISH\n"
                        "2. Summarize the key points discussed\n"
                        "3. Extract any action items with assignees\n"
                        "4. Identify speakers by name or role\n"
                        "5. Note any key decisions made\n\n"
                        "ACTION ITEM ASSIGNMENT RULES (CRITICAL):\n"
                        "- The transcript has speaker labels like '[John]: ...'\n"
                        "- When extracting action items, pay attention to WHO the task is ABOUT, "
                        "not just who is speaking.\n"
                        "- If a speaker says 'Muhammad Umar, please start working on presentations', "
                        "the assigned_to MUST be 'Muhammad Umar' — NOT the speaker and NOT 'All participants'.\n"
                        "- If a speaker says 'Slaxky, you have to work on the project', "
                        "the assigned_to MUST be 'Slaxky'.\n"
                        "- Only use 'All participants' if the task is genuinely for everyone "
                        "(e.g. 'everyone needs to submit reports').\n"
                        "- Extract the assignee's name EXACTLY as mentioned in the transcript.\n\n"
                        "CRITICAL OUTPUT RULE: "
                        "ALL text outputs (english_translation, summary, key_decisions, action items) "
                        "MUST be written in ENGLISH. Even if the transcript is in Urdu, Roman Urdu, "
                        "or any other language, you MUST translate everything to English. "
                        "NEVER output Roman Urdu or Urdu script — always professional English.\n"
                        "{format_instructions}"
                    ),
                ),
                (
                    "human",
                    "Process this transcript chunk (chunk #{chunk_index}):\n\n---\n{transcript}\n---",
                ),
            ]
        )

        chain = prompt | self.llm | parser

        for attempt in range(3):
            try:
                result = chain.invoke(
                    {
                        "transcript": raw_text,
                        "chunk_index": chunk_index,
                        "summary_language": summary_language,
                        "format_instructions": parser.get_format_instructions(),
                    }
                )
                return result
            except Exception as exc:
                if "429" in str(exc) and attempt < 2:
                    time.sleep(25 * (attempt + 1))
                    continue
                raise LLMServiceError(
                    f"Failed to process chunk #{chunk_index}: {exc}"
                ) from exc

    # ──────────────────────────────────────────────
    # Original: Generate final summary (post-meeting)
    # ──────────────────────────────────────────────
    def generate_final_summary(self, chunk_summaries: list[dict], summary_language: str = "English") -> dict:
        parser = JsonOutputParser(pydantic_object=FinalSummaryOutput)

        chunks_context = ""
        for i, chunk in enumerate(chunk_summaries):
            chunks_context += f"\n### Chunk {i + 1}\n"
            chunks_context += f"**Summary:** {chunk.get('summary', 'N/A')}\n"
            chunks_context += (
                f"**English Translation:** {chunk.get('english_translation', 'N/A')}\n"
            )
            decisions = chunk.get("key_decisions", [])
            if decisions:
                chunks_context += f"**Decisions:** {'; '.join(decisions)}\n"
            for item in chunk.get("action_items", []):
                if isinstance(item, dict):
                    chunks_context += f"**Action:** {item.get('task', '')} → {item.get('assigned_to', 'Unassigned')}\n"

        prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    (
                        "You are an expert meeting analyst. Generate a comprehensive final meeting summary.\n"
                        "Requirements: concise title, professional executive summary (3-5 sentences), "
                        "main topics, detailed summary, and consolidated deduplicated action items.\n\n"
                        "ACTION ITEM ASSIGNMENT RULES (CRITICAL):\n"
                        "When consolidating action items from chunks, assign each task to the "
                        "person the task is ABOUT, not the speaker who gave the instruction.\n"
                        "- If chunk says 'Muhammad Umar must work on presentations', "
                        "assigned_to = 'Muhammad Umar'.\n"
                        "- NEVER use 'All participants' unless the task is genuinely for everyone.\n"
                        "- Preserve 'assigned_speaker_id' integers when available.\n\n"
                        "CRITICAL OUTPUT RULE: "
                        "ALL output (title, executive_summary, key_topics, detailed_summary, action items) "
                        "MUST be written in clear, professional ENGLISH. Even if the source transcript "
                        "was in Urdu or Roman Urdu, translate and write everything in English. "
                        "NEVER output Roman Urdu or Urdu script — always English.\n{format_instructions}"
                    ),
                ),
                (
                    "human",
                    "Here are the processed chunks:\n{chunks_context}\n\nGenerate the final meeting summary.",
                ),
            ]
        )

        chain = prompt | self.llm | parser

        for attempt in range(3):
            try:
                return chain.invoke(
                    {
                        "chunks_context": chunks_context,
                        "summary_language": summary_language,
                        "format_instructions": parser.get_format_instructions(),
                    }
                )
            except Exception as exc:
                if "429" in str(exc) and attempt < 2:
                    time.sleep(25 * (attempt + 1))
                    continue
                raise LLMServiceError(
                    f"Failed to generate final summary: {exc}"
                ) from exc


# ── Helpers ───────────────────────────────────────────────────────────────────


def _fmt_time(seconds: float) -> str:
    """Format a timestamp. If it looks like a unix timestamp (> 1e9), show local clock time."""
    import datetime
    if seconds > 1_000_000_000:
        # Unix timestamp — convert to local wall-clock time
        return datetime.datetime.fromtimestamp(seconds).strftime("%H:%M:%S")
    # Audio-relative seconds — show as mm:ss
    m, s = divmod(int(seconds), 60)
    return f"{m:02d}:{s:02d}"


def _fallback_analysis(speaker_name: str, text: str) -> dict:
    """Safe fallback if LLM call fails — prevents pipeline crash."""
    word_count = len(text.split())
    return {
        "sentiment": "neutral",
        "performance_score": 50,
        "summary": f"{speaker_name} spoke approximately {word_count} words in this window.",
        "key_points": [],
        "topic_coverage": {},
        "engagement_signals": {
            "asks_questions": False,
            "provides_data": False,
            "actionable_commitments": False,
            "off_topic": False,
        },
        "one_line_quote": text[:120] if text else "",
        "english_translation": text,
        "_fallback": True,
    }
