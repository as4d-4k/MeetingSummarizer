"""
LLM service for meeting transcript processing.

Uses LangChain + OpenAI GPT-4o for:
  - Processing transcript chunks (translate, summarize, extract action items)
  - Generating a final coherent meeting summary from all chunk summaries

Structured outputs use Pydantic models for reliable JSON extraction.
"""

import json
import logging
from typing import Optional

from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import JsonOutputParser
from django.conf import settings

logger = logging.getLogger(__name__)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Pydantic schemas for structured LLM output
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class ActionItemOutput(BaseModel):
    """A single extracted action item."""
    assigned_to: str = Field(description="Name or role of the person assigned this task")
    task: str = Field(description="Clear description of the task in English")
    deadline: Optional[str] = Field(default=None, description="Deadline if mentioned, else null")


class ChunkProcessingOutput(BaseModel):
    """Structured output from processing a single transcript chunk."""
    english_translation: str = Field(description="Full English translation of the chunk")
    summary: str = Field(description="Concise summary of this chunk (2-3 sentences)")
    key_decisions: list[str] = Field(default_factory=list, description="Key decisions made in this chunk")
    action_items: list[ActionItemOutput] = Field(default_factory=list, description="Action items extracted from this chunk")
    speakers_identified: list[str] = Field(default_factory=list, description="Speaker names/roles identified")


class FinalSummaryOutput(BaseModel):
    """Structured output for the final meeting summary."""
    title: str = Field(description="Auto-generated meeting title (concise)")
    executive_summary: str = Field(description="Executive summary of the entire meeting (3-5 sentences)")
    key_topics: list[str] = Field(description="Main topics discussed")
    detailed_summary: str = Field(description="Detailed summary covering all important points")
    overall_action_items: list[ActionItemOutput] = Field(description="Consolidated, deduplicated action items from the entire meeting")


class LLMServiceError(Exception):
    """Raised when LLM processing fails."""
    pass


class LLMService:
    """
    LLM-powered meeting transcript processor.

    Uses GPT-4o via LangChain for structured extraction.
    """

    def __init__(self, model: str = "gpt-4o", temperature: float = 0.1):
        api_key = settings.OPENAI_API_KEY
        if not api_key:
            raise LLMServiceError("OPENAI_API_KEY is not configured.")

        self.llm = ChatOpenAI(
            model=model,
            temperature=temperature,
            api_key=api_key,
            max_tokens=4096,
        )

    # ──────────────────────────────────────────────
    # Process a single transcript chunk
    # ──────────────────────────────────────────────
    def process_chunk(self, raw_text: str, chunk_index: int = 0) -> dict:
        """
        Process a single transcript chunk through the LLM.

        Takes raw multilingual (Urdu/English) text and produces:
          - English translation
          - Partial summary
          - Key decisions
          - Action items
          - Identified speakers

        Args:
            raw_text: The raw transcript chunk (may contain Urdu/English mix).
            chunk_index: The chunk number for context.

        Returns:
            dict matching ChunkProcessingOutput schema.
        """
        parser = JsonOutputParser(pydantic_object=ChunkProcessingOutput)

        prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert multilingual meeting analyst. You specialize in "
                "processing meeting transcripts that contain a mix of Urdu and English "
                "(code-switching). Your job is to:\n"
                "1. Translate ALL content into professional English\n"
                "2. Summarize the key points discussed\n"
                "3. Extract any action items with assignees\n"
                "4. Identify speakers by name or role\n"
                "5. Note any key decisions made\n\n"
                "If the text is already in English, still process it fully.\n"
                "Be precise and professional in your output.\n\n"
                "{format_instructions}"
            )),
            ("human", (
                "Process this transcript chunk (chunk #{chunk_index}):\n\n"
                "---\n{transcript}\n---"
            )),
        ])

        chain = prompt | self.llm | parser

        logger.info("Processing chunk #%d (%d chars)", chunk_index, len(raw_text))

        try:
            result = chain.invoke({
                "transcript": raw_text,
                "chunk_index": chunk_index,
                "format_instructions": parser.get_format_instructions(),
            })
            logger.info("Chunk #%d processed: %d action items found", chunk_index, len(result.get("action_items", [])))
            return result

        except Exception as exc:
            logger.error("LLM chunk processing failed: %s", exc)
            raise LLMServiceError(f"Failed to process chunk #{chunk_index}: {exc}") from exc

    # ──────────────────────────────────────────────
    # Generate final meeting summary
    # ──────────────────────────────────────────────
    def generate_final_summary(self, chunk_summaries: list[dict]) -> dict:
        """
        Generate a coherent final summary from all chunk processing outputs.

        Takes the list of processed chunk outputs and produces:
          - Auto-generated meeting title
          - Executive summary
          - Key topics
          - Detailed summary
          - Consolidated, deduplicated action items

        Args:
            chunk_summaries: List of dicts (ChunkProcessingOutput format) from process_chunk().

        Returns:
            dict matching FinalSummaryOutput schema.
        """
        parser = JsonOutputParser(pydantic_object=FinalSummaryOutput)

        # Prepare the chunk summaries as context
        chunks_context = ""
        for i, chunk in enumerate(chunk_summaries):
            chunks_context += f"\n### Chunk {i + 1}\n"
            chunks_context += f"**Summary:** {chunk.get('summary', 'N/A')}\n"
            chunks_context += f"**English Translation:** {chunk.get('english_translation', 'N/A')}\n"

            decisions = chunk.get("key_decisions", [])
            if decisions:
                chunks_context += f"**Decisions:** {'; '.join(decisions)}\n"

            items = chunk.get("action_items", [])
            if items:
                for item in items:
                    if isinstance(item, dict):
                        chunks_context += f"**Action:** {item.get('task', '')} → {item.get('assigned_to', 'Unassigned')}\n"

        prompt = ChatPromptTemplate.from_messages([
            ("system", (
                "You are an expert meeting analyst. Given the processed chunks from a meeting "
                "transcript, generate a comprehensive final meeting summary.\n\n"
                "Requirements:\n"
                "- Create a concise, descriptive meeting title\n"
                "- Write a professional executive summary (3-5 sentences)\n"
                "- List the main topics discussed\n"
                "- Provide a detailed summary covering all important points in logical order\n"
                "- Consolidate and deduplicate action items from all chunks\n"
                "- All output must be in professional English\n\n"
                "{format_instructions}"
            )),
            ("human", (
                "Here are the processed chunks from the meeting:\n"
                "{chunks_context}\n\n"
                "Generate the final meeting summary."
            )),
        ])

        chain = prompt | self.llm | parser

        logger.info("Generating final summary from %d chunks", len(chunk_summaries))

        try:
            result = chain.invoke({
                "chunks_context": chunks_context,
                "format_instructions": parser.get_format_instructions(),
            })
            logger.info(
                "Final summary generated: title='%s', %d action items",
                result.get("title", ""),
                len(result.get("overall_action_items", [])),
            )
            return result

        except Exception as exc:
            logger.error("Final summary generation failed: %s", exc)
            raise LLMServiceError(f"Failed to generate final summary: {exc}") from exc
