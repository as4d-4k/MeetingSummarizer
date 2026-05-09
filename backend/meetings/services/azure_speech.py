# """
# meetings/services/azure_speech.py
# -----------------------------------
# Azure Speech Service for Urdu/English/Roman Urdu transcription.
# Handles code-switching (mixing languages mid-sentence).

# Supports:
#   - ur-PK  (Pakistani Urdu - Urdu script)
#   - en-US  (English)
#   - Auto language detection between both
# """

# import os
# import logging
# import tempfile
# import requests
# from django.conf import settings

# logger = logging.getLogger(__name__)


# class AzureSpeechService:
#     """
#     Transcribes audio chunks using Azure Speech.
#     Supports Urdu + English code-switching.
#     """

#     def __init__(self):
#         self.key    = settings.AZURE_SPEECH_KEY
#         self.region = settings.AZURE_SPEECH_REGION

#         if not self.key:
#             raise ValueError("AZURE_SPEECH_KEY not configured")

#     # ──────────────────────────────────────────────────────────────────────────
#     # Main method: transcribe an audio file
#     # ──────────────────────────────────────────────────────────────────────────
#     def transcribe_file(self, audio_file_path: str) -> dict:
#         """
#         Transcribe an audio file.
#         Returns structured result with text + language + words.

#         Args:
#             audio_file_path: path to .wav or .mp4 audio file

#         Returns:
#             {
#                 "text":     "full transcript text",
#                 "language": "ur-PK" or "en-US",
#                 "words":    [...],
#                 "segments": [{"speaker": "A", "text": "...", "start": 0.0}]
#             }
#         """
#         import azure.cognitiveservices.speech as speechsdk

#         # ── Configure speech service ──────────────────────────────────────────
#         speech_config = speechsdk.SpeechConfig(
#             subscription=self.key,
#             region=self.region,
#         )

#         # ── Enable both Urdu and English ──────────────────────────────────────
#         # ur-PK = Pakistani Urdu (trained on Pakistan accent)
#         # en-US = English
#         auto_detect_config = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
#             languages=["ur-PK", "en-US"]
#         )

#         # ── Enable detailed output (words + timestamps) ───────────────────────
#         speech_config.output_format = speechsdk.OutputFormat.Detailed
#         speech_config.request_word_level_timestamps()

#         # ── Enable speaker diarization (who said what) ────────────────────────
#         speech_config.set_property(
#             speechsdk.PropertyId.SpeechServiceResponse_DiarizationEnabled,
#             "true"
#         )

#         # ── Load audio file ───────────────────────────────────────────────────
#         audio_config = speechsdk.audio.AudioConfig(filename=audio_file_path)

#         # ── Create recognizer ─────────────────────────────────────────────────
#         recognizer = speechsdk.SpeechRecognizer(
#             speech_config=speech_config,
#             audio_config=audio_config,
#             auto_detect_source_language_config=auto_detect_config,
#         )

#         # ── Collect all results ───────────────────────────────────────────────
#         all_results = []
#         done        = False

#         def on_result(evt):
#             if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
#                 all_results.append(evt.result)

#         def on_done(evt):
#             nonlocal done
#             done = True

#         recognizer.recognized.connect(on_result)
#         recognizer.session_stopped.connect(on_done)
#         recognizer.canceled.connect(on_done)

#         recognizer.start_continuous_recognition()

#         import time
#         timeout = 60
#         start   = time.time()
#         while not done and (time.time() - start) < timeout:
#             time.sleep(0.1)

#         recognizer.stop_continuous_recognition()

#         # ── Build output ──────────────────────────────────────────────────────
#         return self._build_output(all_results)

#     # ──────────────────────────────────────────────────────────────────────────
#     # Transcribe from URL (Recall.ai download URL)
#     # ──────────────────────────────────────────────────────────────────────────
#     def transcribe_from_url(self, audio_url: str) -> dict:
#         """
#         Download audio from URL and transcribe.
#         Used for Recall.ai recording chunks.
#         """
#         # Download to temp file
#         with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
#             response = requests.get(audio_url, timeout=60)
#             tmp.write(response.content)
#             tmp_path = tmp.name

#         try:
#             result = self.transcribe_file(tmp_path)
#         finally:
#             os.unlink(tmp_path)

#         return result

#     # ──────────────────────────────────────────────────────────────────────────
#     # Transcribe raw bytes (for streaming chunks)
#     # ──────────────────────────────────────────────────────────────────────────
#     def transcribe_bytes(self, audio_bytes: bytes, sample_rate: int = 16000) -> dict:
#         """
#         Transcribe raw PCM audio bytes.
#         Used for real-time 30-second chunks.
#         """
#         # Write bytes to temp WAV file
#         with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
#             tmp.write(self._bytes_to_wav(audio_bytes, sample_rate))
#             tmp_path = tmp.name

#         try:
#             result = self.transcribe_file(tmp_path)
#         finally:
#             os.unlink(tmp_path)

#         return result

#     # ──────────────────────────────────────────────────────────────────────────
#     # Build structured output
#     # ──────────────────────────────────────────────────────────────────────────
#     def _build_output(self, results: list) -> dict:
#         """Convert Azure results to our standard format."""

#         if not results:
#             return {
#                 "text":     "",
#                 "language": "unknown",
#                 "words":    [],
#                 "segments": [],
#             }

#         full_text = " ".join(r.text for r in results if r.text)
#         segments  = []

#         for result in results:
#             # Get language detected
#             lang_result = result.properties.get(
#                 "SpeechServiceResponse_JsonResult", "{}"
#             )

#             import json
#             try:
#                 json_result = json.loads(lang_result)
#                 language    = json_result.get("Language", "en-US")
#                 speaker_id  = json_result.get("SpeakerId", "Unknown")
#                 words       = []

#                 # Extract word-level data
#                 for nbest in json_result.get("NBest", [])[:1]:
#                     for w in nbest.get("Words", []):
#                         words.append({
#                             "word":     w.get("Word", ""),
#                             "start":    w.get("Offset", 0) / 10_000_000,  # ticks → seconds
#                             "end":      (w.get("Offset", 0) + w.get("Duration", 0)) / 10_000_000,
#                             "confidence": w.get("Confidence", 0),
#                         })

#                 segments.append({
#                     "speaker":  speaker_id,
#                     "text":     result.text,
#                     "language": language,
#                     "words":    words,
#                     "start":    words[0]["start"] if words else 0,
#                     "end":      words[-1]["end"]   if words else 0,
#                 })

#             except Exception as e:
#                 logger.warning("Failed to parse Azure result: %s", e)
#                 segments.append({
#                     "speaker":  "Unknown",
#                     "text":     result.text,
#                     "language": "unknown",
#                     "words":    [],
#                     "start":    0,
#                     "end":      0,
#                 })

#         # Detect overall language
#         urdu_count    = sum(1 for s in segments if "ur" in s.get("language",""))
#         english_count = sum(1 for s in segments if "en" in s.get("language",""))

#         if urdu_count > english_count:
#             overall_lang = "ur-PK"
#         elif urdu_count > 0:
#             overall_lang = "mixed"
#         else:
#             overall_lang = "en-US"

#         logger.info(
#             "Azure transcribed: %d segments, %d words, lang=%s",
#             len(segments), len(full_text.split()), overall_lang
#         )

#         return {
#             "text":     full_text,
#             "language": overall_lang,
#             "segments": segments,
#             "words":    [w for s in segments for w in s.get("words", [])],
#         }

#     # ──────────────────────────────────────────────────────────────────────────
#     # Helper: convert raw bytes to WAV
#     # ──────────────────────────────────────────────────────────────────────────
#     @staticmethod
#     def _bytes_to_wav(pcm_bytes: bytes, sample_rate: int) -> bytes:
#         """Wrap raw PCM bytes in a WAV header."""
#         import struct
#         channels    = 1
#         bit_depth   = 16
#         byte_rate   = sample_rate * channels * bit_depth // 8
#         block_align = channels * bit_depth // 8
#         data_size   = len(pcm_bytes)
#         header      = struct.pack(
#             '<4sI4s4sIHHIIHH4sI',
#             b'RIFF', 36 + data_size,
#             b'WAVE', b'fmt ', 16,
#             1, channels, sample_rate,
#             byte_rate, block_align,
#             bit_depth, b'data', data_size,
#         )
#         return header + pcm_bytes





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
    def transcribe_file(self, audio_file_path: str) -> dict:
        """
        Transcribe an audio file.
        Returns COMPLETE sentences only — no partials.
        Each sentence is finalized after 3 seconds of silence.

        Args:
            audio_file_path: path to .wav or .mp4 audio file

        Returns:
            {
                "text":     "full transcript text",
                "language": "ur-PK" or "en-US" or "mixed",
                "words":    [...],
                "segments": [{"speaker": "A", "text": "...", "start": 0.0}]
            }
        """
        import azure.cognitiveservices.speech as speechsdk

        # ── Configure speech service with silence detection ───────────────────
        speech_config = self._build_speech_config()

        # ── Load audio file ───────────────────────────────────────────────────
        audio_config = speechsdk.audio.AudioConfig(filename=audio_file_path)

        # ── Create recognizer with Urdu + English auto-detect ─────────────────
        recognizer = self._build_recognizer(speech_config, audio_config)

        # ── Collect COMPLETE results only ─────────────────────────────────────
        all_results = []
        done        = False

        def on_recognized(evt):
            """
            Fires ONLY when sentence is complete (after 3s silence).
            This is the key event — we ONLY use this one.
            Azure guarantees this is a complete sentence.
            """
            if evt.result.reason == speechsdk.ResultReason.RecognizedSpeech:
                if evt.result.text.strip():
                    all_results.append(evt.result)
                    logger.debug("✅ Complete sentence: %s", evt.result.text[:80])

        def on_recognizing(evt):
            """
            Fires during speech (partial/incomplete sentence).
            We intentionally IGNORE this completely.
            We only want complete sentences from on_recognized above.
            """
            pass  # do nothing — ignore all partials

        def on_done(evt):
            nonlocal done
            done = True

        def on_canceled(evt):
            nonlocal done
            logger.warning("Azure canceled: %s", evt.reason)
            done = True

        # Wire events — on_recognized = complete, on_recognizing = ignored
        recognizer.recognized.connect(on_recognized)    # ✅ complete sentence
        recognizer.recognizing.connect(on_recognizing)  # ❌ partial — ignored
        recognizer.session_stopped.connect(on_done)
        recognizer.canceled.connect(on_canceled)

        recognizer.start_continuous_recognition()

        import time
        timeout = 300   # max 5 minutes per file
        start   = time.time()
        while not done and (time.time() - start) < timeout:
            time.sleep(0.1)

        recognizer.stop_continuous_recognition()

        logger.info("Transcription complete: %d sentences", len(all_results))
        return self._build_output(all_results)

    # ──────────────────────────────────────────────────────────────────────────
    # Transcribe from URL (Recall.ai download URL)
    # ──────────────────────────────────────────────────────────────────────────
    def transcribe_from_url(self, audio_url: str) -> dict:
        """
        Download audio from URL and transcribe.
        Used for Recall.ai recording after meeting ends.
        """
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            response = requests.get(audio_url, timeout=120, stream=True)
            response.raise_for_status()
            for chunk in response.iter_content(chunk_size=8192):
                tmp.write(chunk)
            tmp_path = tmp.name

        try:
            result = self.transcribe_file(tmp_path)
        finally:
            os.unlink(tmp_path)

        return result

    # ──────────────────────────────────────────────────────────────────────────
    # Transcribe raw bytes (for streaming chunks)
    # ──────────────────────────────────────────────────────────────────────────
    def transcribe_bytes(self, audio_bytes: bytes, sample_rate: int = 16000) -> dict:
        """
        Transcribe raw PCM audio bytes.
        Wraps bytes in WAV header then transcribes.
        """
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(self._bytes_to_wav(audio_bytes, sample_rate))
            tmp_path = tmp.name

        try:
            result = self.transcribe_file(tmp_path)
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

        # ── SILENCE DETECTION — THE KEY SETTINGS ─────────────────────────────

        # 1. How long of silence BETWEEN words splits into a new sentence
        #    3000ms = if speaker pauses 3 seconds mid-thought → new sentence
        config.set_property(
            speechsdk.PropertyId.Speech_SegmentationSilenceTimeoutMs,
            SILENCE_TIMEOUT_MS      # "3000"
        )

        # 2. How long of silence AFTER speech = utterance is fully done
        #    Azure waits this long before firing the recognized event
        config.set_property(
            speechsdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
            SILENCE_TIMEOUT_MS      # "3000"
        )

        # 3. How long to wait at START for speaker to begin talking
        #    15 seconds — don't give up too early
        config.set_property(
            speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
            "15000"
        )

        # ── URDU HINT ─────────────────────────────────────────────────────────
        # Tell Azure: "when language is ambiguous, assume Pakistani Urdu"
        # Prevents Urdu words being mistranscribed as English phonetics
        # Example: "bhai" stays "bhai" not heard as something else
        # Example: "hum ne decide kiya" recognized as Urdu not gibberish
        config.set_property(
            speechsdk.PropertyId.SpeechServiceConnection_InitialLanguage,
            "ur-PK"
        )

        # ── OUTPUT FORMAT ─────────────────────────────────────────────────────
        # Detailed = gives us speaker ID + word timestamps + confidence
        config.output_format = speechsdk.OutputFormat.Detailed
        config.request_word_level_timestamps()

        # ── SPEAKER DIARIZATION ───────────────────────────────────────────────
        # Who said what — returns SpeakerId per sentence
        config.set_property(
            speechsdk.PropertyId.SpeechServiceResponse_DiarizationEnabled,
            "true"
        )

        # ── PROPER PUNCTUATION ────────────────────────────────────────────────
        # "hello how are you" → "Hello, how are you?"
        config.set_property(
            speechsdk.PropertyId.SpeechServiceResponse_PostProcessingOption,
            "TrueText"
        )

        return config

    # ──────────────────────────────────────────────────────────────────────────
    # Build recognizer with Urdu + English auto-detect
    # ──────────────────────────────────────────────────────────────────────────
    def _build_recognizer(self, speech_config, audio_config):
        import azure.cognitiveservices.speech as speechsdk

        # Auto-detect between Pakistani Urdu and English
        # Handles mid-sentence code-switching automatically:
        # "hum ne decide kiya ke we will ship next week"
        #  ←── Urdu ──────────→  ←── English ──────────→
        auto_detect = speechsdk.languageconfig.AutoDetectSourceLanguageConfig(
            languages=["ur-PK", "en-US"]
        )

        return speechsdk.SpeechRecognizer(
            speech_config=speech_config,
            audio_config=audio_config,
            auto_detect_source_language_config=auto_detect,
        )

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