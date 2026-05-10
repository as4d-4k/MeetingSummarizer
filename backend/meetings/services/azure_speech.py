


"""
meetings/services/azure_speech.py
-----------------------------------
Azure Speech Service for Urdu/English/Roman Urdu transcription.
Handles code-switching (mixing languages mid-sentence).

Supports:
  - ur-PK  (Pakistani Urdu - Urdu script)
  - en-US  (English)
  - Auto language detection between both

SILENCE DETECTION:
  - 3 seconds of silence = sentence is complete
  - Azure NEVER fires partial results
  - Only fires when speaker finishes speaking + 3s pause
"""

import os
import logging
import tempfile
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

# ── Silence timeout in milliseconds ──────────────────────────────────────────
# 3000ms = 3 seconds of silence before sentence is finalized
# Increase to 4500 if speakers pause a lot between words
SILENCE_TIMEOUT_MS = str(getattr(settings, 'AZURE_SILENCE_TIMEOUT_MS', 3000))


class AzureSpeechService:
    """
    Transcribes audio using Azure Speech.
    Supports Urdu + English code-switching.
    Only returns COMPLETE sentences (after 3s silence).
    Never returns partial/cut-off text.
    """

    def __init__(self):
        self.key    = settings.AZURE_SPEECH_KEY
        self.region = settings.AZURE_SPEECH_REGION

        if not self.key:
            raise ValueError("AZURE_SPEECH_KEY not configured")

    # ──────────────────────────────────────────────────────────────────────────
    # Main method: transcribe an audio file
    # ──────────────────────────────────────────────────────────────────────────
    def transcribe_file(
        self,
        audio_file_path: str,
        hint_phrases: list = None,
        skip_warmup_seconds: float = 0.0,
        detect_languages: list = None,
    ) -> dict:
        """
        Transcribe an audio file. Returns complete sentences only.

        skip_warmup_seconds > 0  →  DETECT-THEN-LOCK mode:
            Phase 1 (warmup): Listen to first N seconds with AutoDetect.
                              Collect what language Azure assigns to each utterance.
                              These warmup results are DISCARDED from output.
            Phase 2 (capture): After warmup, ONLY keep results whose detected
                               language matches the dominant warmup language.
                               This prevents per-sentence language switching
                               and random English words appearing in Urdu meetings.

        skip_warmup_seconds == 0 → HINTS mode:
            Run with configured language pair + hint phrases from the start.
            No warmup, no language filtering. Azure uses PhraseListGrammar
            to boost recognition of domain-specific and language-specific phrases.
        """
        import azure.cognitiveservices.speech as speechsdk
        from collections import Counter

        skip_ticks = int(skip_warmup_seconds * 10_000_000)  # seconds → 100ns ticks

        speech_config = self._build_speech_config()
        audio_config  = speechsdk.audio.AudioConfig(filename=audio_file_path)

        recognizer = self._build_recognizer(
            speech_config, audio_config,
            hint_phrases=hint_phrases or [],
            detect_languages=detect_languages,
        )

        # ── State shared between callbacks ────────────────────────────────────
        warmup_lang_votes = []   # language codes seen during warmup phase
        post_warmup       = []   # (result, detected_lang) tuples after warmup
        done              = False

        def _get_detected_lang(result):
            """Extract per-result detected language from Azure's auto-detect metadata."""
            try:
                adr = speechsdk.AutoDetectSourceLanguageResult(result)
                return adr.language   # e.g. "ur-PK", "en-US"
            except Exception:
                return None

        def on_recognized(evt):
            if evt.result.reason != speechsdk.ResultReason.RecognizedSpeech:
                return
            text = evt.result.text.strip()
            if not text:
                return

            audio_pos_secs = evt.result.offset / 10_000_000
            detected_lang  = _get_detected_lang(evt.result)

            if skip_ticks > 0 and evt.result.offset < skip_ticks:
                # ── Warmup phase: collect language votes, discard output ───────
                if detected_lang:
                    warmup_lang_votes.append(detected_lang)
                logger.info(
                    "⏳ Warmup at %.2fs (lang=%s): %s",
                    audio_pos_secs, detected_lang, text[:60],
                )
                return  # Do NOT add to output

            # ── Capture phase: store with detected language for filtering ─────
            post_warmup.append((evt.result, detected_lang))
            logger.debug(
                "📝 Captured at %.2fs (lang=%s): %s",
                audio_pos_secs, detected_lang, text[:80],
            )

        def on_recognizing(evt):
            pass  # ignore partials

        def on_done(evt):
            nonlocal done
            done = True

        def on_canceled(evt):
            nonlocal done
            logger.warning("Azure canceled: %s", evt.reason)
            done = True

        recognizer.recognized.connect(on_recognized)
        recognizer.recognizing.connect(on_recognizing)
        recognizer.session_stopped.connect(on_done)
        recognizer.canceled.connect(on_canceled)

        recognizer.start_continuous_recognition()

        import time
        timeout = 300   # max 5 minutes per file
        start   = time.time()
        while not done and (time.time() - start) < timeout:
            time.sleep(0.1)

        recognizer.stop_continuous_recognition()

        # ── Determine dominant language from warmup votes ─────────────────────
        if skip_ticks > 0 and warmup_lang_votes:
            dominant_lang = Counter(warmup_lang_votes).most_common(1)[0][0]
            logger.info(
                "🔒 Warmup complete: %d votes → dominant language = %s | votes breakdown: %s",
                len(warmup_lang_votes), dominant_lang,
                dict(Counter(warmup_lang_votes)),
            )
        elif skip_ticks > 0:
            # No speech in warmup window — fall back to first candidate language
            dominant_lang = (detect_languages or ["ur-PK"])[0]
            logger.warning(
                "⚠️ No speech detected during warmup — defaulting to %s", dominant_lang
            )
        else:
            dominant_lang = None  # hints mode: no filtering needed

        # ── Filter post-warmup results to dominant language only ──────────────
        if dominant_lang:
            all_results = [
                result for result, lang in post_warmup
                if lang == dominant_lang or lang is None  # keep undetermined too
            ]
            discarded = len(post_warmup) - len(all_results)
            logger.info(
                "✅ Locked to %s: keeping %d/%d sentences (discarded %d wrong-language)",
                dominant_lang, len(all_results), len(post_warmup), discarded,
            )
        else:
            # Hints mode — no language filtering, keep everything
            all_results = [result for result, _ in post_warmup]

        return self._build_output(all_results)

    # ──────────────────────────────────────────────────────────────────────────
    # Transcribe from URL (Recall.ai download URL)
    # ──────────────────────────────────────────────────────────────────────────
    def transcribe_from_url(
        self,
        audio_url: str,
        hint_phrases: list = None,
        skip_warmup_seconds: float = 0.0,
        detect_languages: list = None,
    ) -> dict:
        """Download audio from URL and transcribe."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            response = requests.get(audio_url, timeout=120, stream=True)
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8192):
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            result = self.transcribe_file(
                tmp_path,
                hint_phrases=hint_phrases,
                skip_warmup_seconds=skip_warmup_seconds,
                detect_languages=detect_languages,
            )
        finally:
            os.unlink(tmp_path)

        return result

    # ──────────────────────────────────────────────────────────────────────────
    # Transcribe raw bytes (for streaming chunks)
    # ──────────────────────────────────────────────────────────────────────────
    def transcribe_bytes(
        self,
        audio_bytes: bytes,
        sample_rate: int = 16000,
        hint_phrases: list = None,
        skip_warmup_seconds: float = 0.0,
        detect_languages: list = None,
    ) -> dict:
        """Transcribe raw PCM audio bytes."""
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(self._bytes_to_wav(audio_bytes, sample_rate))
            tmp_path = tmp.name

        try:
            result = self.transcribe_file(
                tmp_path,
                hint_phrases=hint_phrases,
                skip_warmup_seconds=skip_warmup_seconds,
                detect_languages=detect_languages,
            )
        finally:
            os.unlink(tmp_path)

        return result

    # ──────────────────────────────────────────────────────────────────────────
    # Build speech config WITH silence detection settings
    # ──────────────────────────────────────────────────────────────────────────
    def _build_speech_config(self):
        import azure.cognitiveservices.speech as speechsdk

        config = speechsdk.SpeechConfig(
            subscription=self.key,
            region=self.region,
        )

        # All properties use set_property_by_name (string-based) to avoid AttributeError
        # when PropertyId enum members are missing in older/different SDK builds.

        # 1. Silence between words to split into a new sentence (3000ms)
        try:
            config.set_property(
                speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
                SILENCE_TIMEOUT_MS
            )
        except AttributeError:
            config.set_property_by_name("Speech_SegmentationSilenceTimeoutMs", SILENCE_TIMEOUT_MS)

        # 2. Silence after speech = utterance fully done (3000ms)
        try:
            config.set_property(
                speechsdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
                SILENCE_TIMEOUT_MS
            )
        except AttributeError:
            config.set_property_by_name("SpeechServiceConnection_EndSilenceTimeoutMs", SILENCE_TIMEOUT_MS)

        # 3. Wait up to 15s at start before giving up
        try:
            config.set_property(
                speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
                "15000"
            )
        except AttributeError:
            config.set_property_by_name("SpeechServiceConnection_InitialSilenceTimeoutMs", "15000")

        # NOTE: InitialLanguage is NOT set here — it is set per-recognizer
        # in _build_recognizer() based on the detect_languages list.
        # Setting it here globally caused Roman Urdu (en-US) to still switch
        # to ur-PK (Urdu script) mid-session.

        # ── OUTPUT FORMAT ─────────────────────────────────────────────────────
        # Detailed = gives us speaker ID + word timestamps + confidence
        config.output_format = speechsdk.OutputFormat.Detailed

        # request_word_level_timestamps — guard for older SDK versions
        try:
            config.request_word_level_timestamps()
        except Exception:
            pass

        # ── SPEAKER DIARIZATION ───────────────────────────────────────────────
        # Use set_property_by_name (string-based) — works across ALL SDK versions.
        # PropertyId.SpeechServiceResponse_DiarizationEnabled is missing in some builds.
        try:
            config.set_property_by_name(
                "SpeechServiceResponse_DiarizationEnabled", "true"
            )
        except Exception:
            pass  # diarization not available in this SDK build — speaker IDs will be absent

        # ── PROPER PUNCTUATION ────────────────────────────────────────────────
        # "hello how are you" → "Hello, how are you?"
        try:
            config.set_property(
                speechsdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
                "TrueText"
            )
        except Exception:
            pass

        return config

    # ──────────────────────────────────────────────────────────────────────────
    # Build recognizer — language list is dynamic
    # ──────────────────────────────────────────────────────────────────────────
    def _build_recognizer(
        self,
        speech_config,
        audio_config,
        hint_phrases: list = None,
        detect_languages: list = None,
    ):
        import azure.cognitiveservices.speech as speechsdk

        # Default language detection list
        if not detect_languages:
            detect_languages = ["ur-PK", "en-US"]

        if len(detect_languages) == 1:
            # ── Single-language mode (e.g. Roman Urdu = en-US only) ────────────
            # Lock Azure to one language — NEVER switches to another script.
            # Do NOT set InitialLanguage in speech_config at all for this mode.
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
                language=detect_languages[0],
            )
        else:
            # ── Multi-language auto-detect (Urdu + English code-switching) ────
            # Bias Azure towards primary language for ambiguous phonemes.
            try:
                speech_config.set_property(
                    speechsdk.PropertyId.SpeechServiceConnection_InitialLanguage,
                    detect_languages[0],
                )
            except AttributeError:
                speech_config.set_property_by_name(
                    "SpeechServiceConnection_InitialLanguage",
                    detect_languages[0],
                )
            auto_detect = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
                languages=detect_languages
            )
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config,
                audio_config=audio_config,
                auto_detect_source_language_config=auto_detect,
            )

        # ── Inject AI-generated phrase hints ─────────────────────────────────
        # PhraseListGrammar boosts recognition probability for listed phrases.
        # Critical for Roman Urdu: makes Azure prefer "acha" over "aha", etc.
        if hint_phrases:
            phrase_list = speechsdk.PhraseListGrammar.from_recognizer(recognizer)
            for phrase in hint_phrases[:500]:
                phrase_list.addPhrase(phrase)
            logger.info(
                "Injected %d hint phrases | languages=%s",
                len(hint_phrases), detect_languages,
            )

        return recognizer

    # ──────────────────────────────────────────────────────────────────────────
    # Build structured output from Azure results
    # ──────────────────────────────────────────────────────────────────────────
    def _build_output(self, results: list) -> dict:
        """Convert Azure results into our standard format."""

        if not results:
            return {
                "text":     "",
                "language": "unknown",
                "words":    [],
                "segments": [],
            }

        full_text = " ".join(r.text for r in results if r.text)
        segments  = []

        import json
        for result in results:
            json_str = result.properties.get(
                "SpeechServiceResponse_JsonResult", "{}"
            )
            try:
                data       = json.loads(json_str)
                language   = data.get("Language", "en-US")
                speaker_id = data.get("SpeakerId", "Unknown")
                words      = []

                for nbest in data.get("NBest", [])[:1]:
                    for w in nbest.get("Words", []):
                        words.append({
                            "word":       w.get("Word", ""),
                            "start":      w.get("Offset", 0) / 10_000_000,
                            "end":        (w.get("Offset", 0) + w.get("Duration", 0)) / 10_000_000,
                            "confidence": w.get("Confidence", 0),
                        })

                segments.append({
                    "speaker":  speaker_id,
                    "text":     result.text,
                    "language": language,
                    "words":    words,
                    "start":    words[0]["start"] if words else 0,
                    "end":      words[-1]["end"]   if words else 0,
                })

            except Exception as e:
                logger.warning("Failed to parse Azure result: %s", e)
                segments.append({
                    "speaker":  "Unknown",
                    "text":     result.text,
                    "language": "unknown",
                    "words":    [],
                    "start":    0,
                    "end":      0,
                })

        # Detect overall language of the audio
        urdu_count    = sum(1 for s in segments if "ur" in s.get("language", ""))
        english_count = sum(1 for s in segments if "en" in s.get("language", ""))

        if urdu_count > english_count:
            overall_lang = "ur-PK"
        elif urdu_count > 0:
            overall_lang = "mixed"
        else:
            overall_lang = "en-US"

        logger.info(
            "Azure output: %d complete sentences, lang=%s",
            len(segments), overall_lang
        )

        return {
            "text":     full_text,
            "language": overall_lang,
            "segments": segments,
            "words":    [w for s in segments for w in s.get("words", [])],
        }

    # ──────────────────────────────────────────────────────────────────────────
    # Helper: wrap raw PCM bytes in WAV header
    # ──────────────────────────────────────────────────────────────────────────
    @staticmethod
    def _bytes_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
        """Wrap raw PCM16 bytes in a proper WAV file header."""
        import struct
        channels    = 1
        bit_depth   = 16
        byte_rate   = sample_rate * channels * bit_depth // 8
        block_align = channels * bit_depth // 8
        data_size   = len(pcm_bytes)
        header      = struct.pack(
            '<4sI4s4sIHHIIHH4sI',
            b'RIFF', 36 + data_size,
            b'WAVE', b'fmt ', 16,
            1, channels, sample_rate,
            byte_rate, block_align,
            bit_depth, b'data', data_size,
        )
        return header + pcm_bytes