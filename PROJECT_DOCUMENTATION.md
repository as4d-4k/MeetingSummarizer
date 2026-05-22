# MeetingIntel — Autonomous Multilingual Meeting Summarizer

> **Complete Project Documentation**
> Last updated: 2026-05-22

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture Diagram](#2-architecture-diagram)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Environment Variables](#5-environment-variables)
6. [Backend — Django](#6-backend--django)
   - [Models](#61-models)
   - [Services](#62-services)
   - [Celery Tasks](#63-celery-tasks)
   - [Views & API Endpoints](#64-views--api-endpoints)
   - [WebSocket System](#65-websocket-system)
   - [Transliteration Engine](#66-transliteration-engine)
   - [Transcript Buffer](#67-transcript-buffer)
7. [Frontend — React](#7-frontend--react)
   - [Routing & Pages](#71-routing--pages)
   - [Components](#72-components)
   - [WebSocket Integration](#73-websocket-integration)
   - [API Client](#74-api-client)
   - [Auth System](#75-auth-system)
   - [Design System](#76-design-system)
8. [Data Flow — End-to-End](#8-data-flow--end-to-end)
9. [Multilingual Pipeline](#9-multilingual-pipeline)
10. [Running the Application](#10-running-the-application)
11. [Key Design Decisions](#11-key-design-decisions)
12. [Known Constraints & Gotchas](#12-known-constraints--gotchas)

---

## 1. Project Overview

MeetingIntel is a **full-stack autonomous meeting summarizer** that:

1. **Deploys a bot** to Google Meet, Zoom, or Microsoft Teams via [Recall.ai](https://recall.ai)
2. **Transcribes speech in real-time** using Deepgram Nova-3 (via Recall.ai) with Urdu/Hindi → Roman Urdu transliteration
3. **Analyses speakers live** — every 60 seconds, GPT-4o-mini scores each speaker on performance (0-100), sentiment, topic coverage, and key points
4. **Processes the full meeting post-call** — downloads recording, transcribes via Azure Speech / Whisper, chunks the transcript, extracts action items with LLM, generates an executive summary
5. **Distributes action items** — fuzzy-matches speakers to a Team Directory and sends personalized Email + Slack notifications
6. **Tracks team performance** — gamified user profiles with ranks (Bronze→Diamond), achievements, performance charts, and leaderboards

The application is designed for **Urdu-English bilingual environments** where speakers frequently code-switch between languages.

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MEETING PLATFORM                            │
│                 (Google Meet / Zoom / MS Teams)                      │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Audio stream
                            ▼
┌───────────────────────────────────────────┐
│              RECALL.AI BOT                │
│  - Joins meeting as a participant         │
│  - Streams audio to Deepgram Nova-3       │
│  - Sends transcript webhooks to backend   │
│  - Records MP4 for post-meeting pipeline  │
└─────────────┬──────────────┬──────────────┘
              │ Webhooks     │ Status webhooks
              ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     DJANGO BACKEND (Daphne ASGI)                    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐    │
│  │  Webhook      │  │  REST API    │  │  WebSocket Consumer    │    │
│  │  Handlers     │  │  (DRF)       │  │  (Django Channels)     │    │
│  └──────┬───────┘  └──────────────┘  └───────────┬────────────┘    │
│         │                                         │                 │
│         ▼                                         │                 │
│  ┌──────────────────────────────┐                 │                 │
│  │  Transliteration Engine      │                 │                 │
│  │  (Urdu/Hindi → Roman Urdu)  │                 │                 │
│  └──────┬───────────────────────┘                 │                 │
│         │                                         │                 │
│         ▼                                         │                 │
│  ┌──────────────────────────────┐    ┌───────────┴────────────┐    │
│  │  Transcript Buffer           │    │  Broadcast Module       │    │
│  │  (Per-speaker, in-memory)   │───▶│  (HTTP bridge for       │    │
│  └──────┬───────────────────────┘    │   Celery → Daphne)     │    │
│         │                            └────────────────────────┘    │
│         ▼                                                          │
│  ┌──────────────────────────────────────────────┐                  │
│  │  CELERY WORKERS + BEAT                        │                  │
│  │                                               │                  │
│  │  Every 60s:                                   │                  │
│  │   • flush_speaker_buffers → GPT-4o-mini      │                  │
│  │   • process_live_chunks → LLM chunk analysis  │                  │
│  │                                               │                  │
│  │  On meeting end:                              │                  │
│  │   • process_meeting_pipeline                  │                  │
│  │   • distribute_action_items                   │                  │
│  │   • compute_participant_scores                │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                     │
│  ┌──────────────────────────────────────────────┐                  │
│  │  SERVICES                                     │                  │
│  │  • RecallService (Recall.ai API)             │                  │
│  │  • LLMService (GPT-4o-mini via LangChain)    │                  │
│  │  • TranscriptionService (Whisper)            │                  │
│  │  • AzureSpeechService (Azure STT)            │                  │
│  │  • NotificationService (Email + Slack)        │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                     │
│  ┌──────────────┐                                                  │
│  │  DATABASE     │  MySQL (prod) / SQLite (dev)                    │
│  └──────────────┘                                                  │
│  ┌──────────────┐                                                  │
│  │  REDIS        │  Celery broker + result backend                 │
│  └──────────────┘                                                  │
└─────────────────────────────────────────────────────────────────────┘
              │ WebSocket push
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     REACT FRONTEND (Vite)                           │
│                                                                     │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────────────┐      │
│  │  Dashboard  │  │  Meeting     │  │  Team Directory        │      │
│  │  (list)     │  │  Detail      │  │  + User Profiles       │      │
│  └────────────┘  │  (live dash) │  │  (gamified)            │      │
│                  └──────────────┘  └────────────────────────┘      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Technology Stack

### Backend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | Django | 4.2 |
| API | Django REST Framework | 3.14+ |
| ASGI Server | Daphne (via Django Channels) | 4.2 |
| WebSockets | Django Channels | 4.0+ |
| Task Queue | Celery | 5.3+ |
| Message Broker | Redis | 5.0+ |
| Database | MySQL (prod) / SQLite (dev) | — |
| Auth | JWT via SimpleJWT | 5.3+ |
| LLM | OpenAI GPT-4o-mini via LangChain | — |
| Live Transcription | Deepgram Nova-3 (via Recall.ai) | — |
| Post-meeting STT | Azure Speech / OpenAI Whisper | — |
| Meeting Bot | Recall.ai | — |
| Notifications | Email (SMTP) + Slack SDK | — |

### Frontend
| Component | Technology | Version |
|-----------|-----------|---------|
| Framework | React | 19.2 |
| Build Tool | Vite | 8.0 |
| Routing | React Router DOM | 7.14 |
| HTTP Client | Axios | 1.15 |
| CSS | Tailwind CSS + Custom CSS | 4.2 |
| Fonts | Syne (display) + DM Sans (body) | Google Fonts |

---

## 4. Project Structure

```
NLPproject/
├── backend/
│   ├── .env                          # Environment variables
│   ├── manage.py                     # Django management
│   ├── requirements.txt              # Python dependencies
│   ├── config/
│   │   ├── settings.py               # Django settings (310 lines)
│   │   ├── urls.py                   # Root URL config
│   │   ├── asgi.py                   # ASGI + WebSocket routing
│   │   ├── celery.py                 # Celery app config
│   │   └── wsgi.py                   # WSGI config
│   ├── accounts/
│   │   ├── models.py                 # User + UserLanguageProfile
│   │   ├── views.py                  # Auth + language preferences
│   │   ├── serializers.py            # Register, Login, Profile
│   │   └── urls.py                   # Account routes
│   └── meetings/
│       ├── models.py                 # 8 models (380 lines)
│       ├── views.py                  # ViewSets + webhooks (656 lines)
│       ├── serializers.py            # DRF serializers (173 lines)
│       ├── urls.py                   # Meeting API routes
│       ├── webhook_urls.py           # Recall.ai webhook routes
│       ├── tasks.py                  # Celery tasks (1274 lines)
│       ├── consumers.py              # WebSocket consumer (164 lines)
│       ├── routing.py                # WS URL routing
│       ├── broadcast.py              # WS broadcast helper (61 lines)
│       ├── transcript_buffer.py      # In-memory speaker buffers (187 lines)
│       ├── services/
│       │   ├── recall_service.py     # Recall.ai API (222 lines)
│       │   ├── llm_service.py        # GPT-4o-mini (415 lines)
│       │   ├── transcription_service.py  # Whisper (233 lines)
│       │   ├── azure_speech.py       # Azure STT (489 lines)
│       │   └── notification_service.py   # Email + Slack (286 lines)
│       └── utils/
│           └── transliterate.py      # Urdu/Hindi → Roman Urdu (434 lines)
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js                # Vite + proxy to :8000
│   └── src/
│       ├── main.jsx                  # Entry point
│       ├── App.jsx                   # Routes + AuthProvider
│       ├── index.css                 # Design system (795 lines)
│       ├── api/
│       │   └── client.js             # Axios + JWT + all API functions
│       ├── context/
│       │   └── AuthContext.jsx       # Auth provider + session management
│       ├── hooks/
│       │   └── useWebSocket.js       # WS hook for live updates
│       ├── components/
│       │   ├── Layout.jsx            # Sidebar layout
│       │   ├── ProtectedRoute.jsx    # Auth guard
│       │   ├── NewMeetingModal.jsx   # Meeting creation panel
│       │   ├── LiveDashboard.jsx     # Real-time speaker cards + feed
│       │   ├── ActionItemList.jsx    # Action items with notifications
│       │   └── MeetingCard.jsx       # Meeting list card (legacy)
│       └── pages/
│           ├── Login.jsx             # Email/password login
│           ├── Register.jsx          # 3-step registration wizard
│           ├── Dashboard.jsx         # Meeting list + stats
│           ├── MeetingDetail.jsx     # Live dashboard + tabs (708 lines)
│           ├── Admin.jsx             # Profile settings
│           ├── TeamDirectory.jsx     # Team CRUD
│           ├── UserProfile.jsx       # Gamified profile page
│           └── profileCharts.jsx     # SVG chart components
│
└── PROJECT_DOCUMENTATION.md          # This file
```

---

## 5. Environment Variables

All stored in `backend/.env`:

| Variable | Purpose | Example |
|----------|---------|---------|
| `SECRET_KEY` | Django secret key | `django-insecure-...` |
| `DEBUG` | Debug mode | `True` |
| `DB_NAME` | MySQL database name | `meeting_summarizer` |
| `DB_USER` | MySQL username | `root` |
| `DB_PASSWORD` | MySQL password | `****` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `REDIS_URL` | Redis connection | `redis://127.0.0.1:6379/0` |
| `OPENAI_API_KEY` | OpenAI (GPT-4o-mini + Whisper) | `sk-...` |
| `GOOGLE_API_KEY` | Google API (Gemini, referenced) | `AI...` |
| `RECALL_AI_API_KEY` | Recall.ai API key | `...` |
| `WEBHOOK_BASE_URL` | Ngrok HTTPS URL for webhooks | `https://xxxx.ngrok-free.app` |
| `AZURE_SPEECH_KEY` | Azure Cognitive Services key | `...` |
| `AZURE_SPEECH_REGION` | Azure region | `southeastasia` |
| `SLACK_BOT_TOKEN` | Slack bot OAuth token | `xoxb-...` |
| `EMAIL_HOST_USER` | Gmail SMTP username | `user@gmail.com` |
| `EMAIL_HOST_PASSWORD` | Gmail app password | `****` |
| `DEFAULT_FROM_EMAIL` | Sender email address | `user@gmail.com` |

---

## 6. Backend — Django

### 6.1 Models

#### Meeting
The central entity. One meeting = one bot session.

| Field | Type | Notes |
|-------|------|-------|
| `user` | FK → User | Owner (CASCADE) |
| `meeting_url` | URLField(500) | Meeting link |
| `title` | CharField(255) | Auto-generated by LLM post-meeting |
| `date` | DateTimeField | auto_now_add |
| `status` | CharField(20) | `pending` → `bot_joining` → `in_progress` → `processing` → `completed` / `failed` |
| `bot_id` | CharField(255) | Recall.ai bot UUID |
| `full_transcript` | TextField | Final assembled transcript |
| `final_summary` | TextField | LLM-generated executive summary |
| `target_topics` | JSONField | Topics to track coverage for (e.g., ["Budget", "Timeline"]) |
| `live_language` | CharField(50) | Default "English" |
| `summary_language` | CharField(50) | Default "English" |
| `transcription_mode` | CharField(10) | `auto`, `skip`, or `hints` |

#### Speaker
Represents a participant detected during a live meeting.

| Field | Type | Notes |
|-------|------|-------|
| `meeting` | FK → Meeting | CASCADE |
| `recall_participant_id` | CharField(255) | Recall.ai participant UUID |
| `name` | CharField(150) | Display name from meeting platform |
| `is_speaking` | BooleanField | Currently active (green dot in UI) |
| `talk_time_seconds` | PositiveIntegerField | Running total |
| `word_count` | PositiveIntegerField | Running total |
| `performance_score` | FloatField | 0-100, from LLM analysis |
| `sentiment` | CharField(20) | positive / neutral / negative |
| `last_quote` | TextField | Most recent notable utterance |

**Unique constraint:** `(meeting, recall_participant_id)`

#### LiveTranscriptSegment
Individual utterance received from Deepgram during live meeting.

| Field | Type | Notes |
|-------|------|-------|
| `meeting` | FK → Meeting | CASCADE |
| `speaker` | FK → Speaker | CASCADE, nullable |
| `text` | TextField | Transliterated text |
| `start_time` / `end_time` | FloatField | Seconds from meeting start |
| `is_final` | BooleanField | Default True |
| `received_at` | DateTimeField | auto_now_add |

#### SpeakerAnalysis
Result of GPT-4o-mini analysis on a speaker's 60-second window.

| Field | Type | Notes |
|-------|------|-------|
| `speaker` | FK → Speaker | CASCADE, related_name="analyses" |
| `window_start` / `window_end` | FloatField | Seconds |
| `sentiment` | CharField(20) | positive / neutral / negative |
| `performance_score` | FloatField | 0-100 |
| `summary` | TextField | Window summary |
| `key_points` | JSONField | List of strings |
| `topic_coverage` | JSONField | Dict: topic → percentage |
| `one_line_quote` | TextField | Notable quote |
| `engagement_signals` | JSONField | asks_questions, provides_data, etc. |

#### TranscriptChunk
Post-meeting: transcript split into ~60-second chunks, each processed by LLM.

| Field | Type | Notes |
|-------|------|-------|
| `meeting` | FK → Meeting | CASCADE |
| `chunk_index` | PositiveIntegerField | Sequential order |
| `raw_text` | TextField | Raw transcript text |
| `processed_json` | JSONField | LLM output: summary, key_decisions, action_items |
| `timestamp_start` / `timestamp_end` | FloatField | Seconds |

#### ActionItem
Extracted from transcript chunks by LLM.

| Field | Type | Notes |
|-------|------|-------|
| `meeting` | FK → Meeting | CASCADE |
| `assigned_speaker` | CharField(150) | Assignee name |
| `task_description` | TextField | Task in English |
| `deadline` | CharField(100) | Nullable |
| `is_completed` | BooleanField | Toggle-able from UI |
| `speaker` | FK → Speaker | SET_NULL, nullable |
| `notification_sent` | BooleanField | Track delivery status |

#### TeamDirectory
User's team roster for action item routing.

| Field | Type | Notes |
|-------|------|-------|
| `user` | FK → User | CASCADE |
| `name` | CharField(150) | Display name |
| `email` | EmailField | For email notifications |
| `slack_id` | CharField(50) | For Slack DMs |
| `key` | CharField(10) | Auto-generated 10-digit login key |

#### UserMeetingScore
Per-participant per-meeting performance record for profile pages.

| Field | Type | Notes |
|-------|------|-------|
| `team_member` | FK → TeamDirectory | CASCADE |
| `meeting` | FK → Meeting | CASCADE |
| `performance_score` | FloatField | 0-100 |
| `sentiment_positive/neutral/negative` | PositiveIntegerField | Segment counts |
| `contribution_summary` | TextField | Summary text |
| `word_count` | PositiveIntegerField | Words spoken |
| `talk_time_seconds` | PositiveIntegerField | Talk time |

#### User (accounts app)
Custom user with email-based auth (`USERNAME_FIELD = "email"`).

#### UserLanguageProfile (accounts app)
One-to-one with User. Stores language preferences and AI-generated hint phrases for Azure Speech.

| Field | Type | Notes |
|-------|------|-------|
| `primary_language` | CharField | BCP-47 code (e.g., "ur-PK") |
| `secondary_language` | CharField | BCP-47 code |
| `industry` | CharField | technology, finance, medical, education, legal, general |
| `hint_phrases` | JSONField | ~80 AI-generated phrases for Azure Speech |

---

### 6.2 Services

#### RecallService (`recall_service.py`)
Client for the Recall.ai API. **Region: `ap-northeast-1` (Japan).**

| Method | What it does |
|--------|-------------|
| `create_bot(meeting_url, bot_name, live_language)` | Creates bot with **Deepgram Nova-3** streaming (`language: "multi"`, `smart_format: true`). Configures webhook at `{WEBHOOK_BASE_URL}/api/webhooks/recall/transcript/` for `transcript.data` events. |
| `get_bot_status(bot_id)` | Polls bot status |
| `get_transcript(bot_id)` | Fetches transcript segments (handles multiple response formats) |
| `get_recording_url(bot_id)` | Gets video download URL |
| `download_recording(url, path)` | Downloads MP4 file |
| `leave_bot(bot_id)` | Makes bot leave the call |

**Current Deepgram config:**
```python
"deepgram_streaming": {
    "model": "nova-3",
    "language": "multi",
    "smart_format": True
}
```

#### LLMService (`llm_service.py`)
All LLM calls go through GPT-4o-mini via LangChain (`temperature=0.1, max_tokens=4096`).
Uses **Pydantic structured output** for reliable JSON parsing.

| Method | When called | What it does |
|--------|------------|-------------|
| `analyse_speaker_window()` | Every 60s (live) | Analyses a speaker's 60s window → sentiment, performance_score (0-100), summary, key_points, topic_coverage, one_line_quote. Receives cumulative summary from previous window for continuity. 3 retry attempts. |
| `process_chunk()` | Post-meeting | Processes a transcript chunk → English translation, summary, key_decisions, action_items (with speaker assignment), speakers_identified. |
| `generate_final_summary()` | Post-meeting | Generates executive_summary, title, key_topics, overall_action_items from all chunk summaries. |

All methods force **English output** regardless of input language.

#### TranscriptionService (`transcription_service.py`)
| Method | What it does |
|--------|-------------|
| `transcribe_audio(path, live_language)` | Transcribes audio via OpenAI Whisper-1. Language-aware prompting. Roman Urdu forces `language="en"`. |
| `assemble_recall_transcript(segments)` | Converts Recall.ai transcript segments → speaker-labelled text |
| `chunk_transcript(transcript, chunk_duration=60s)` | Splits transcript into time-based chunks (~150 words/min) |

#### AzureSpeechService (`azure_speech.py`)
Full-featured Azure Cognitive Services integration for post-meeting transcription.

- **Urdu + English code-switching** support
- **Speaker diarization**
- **Two modes:**
  - **HINTS mode** (`skip_warmup=0`): Uses `PhraseListGrammar` with AI-generated hint phrases
  - **DETECT-THEN-LOCK mode** (`skip_warmup>0`): Auto-detects language during warmup, locks to dominant language
- 3-second silence detection for sentence finalization
- Word-level timestamps + confidence scores

#### NotificationService (`notification_service.py`)
| Method | What it does |
|--------|-------------|
| `send_email_action_items(...)` | HTML-formatted email with gradient header, styled action item list |
| `send_slack_action_items(...)` | Slack Block Kit DM with header, sections, dividers |
| `send_credentials_email(...)` | Sends profile login credentials to team members |

---

### 6.3 Celery Tasks

#### Periodic Tasks (Celery Beat — every 60 seconds)

| Task | What it does |
|------|-------------|
| `flush_speaker_buffers` | For each active meeting: finds segments from last 60s per speaker. If ≥5 words → dispatches `flush_single_speaker` for LLM analysis. |
| `process_live_chunks` | Groups live segments into 1-minute audio-time chunks. Runs LLM `process_chunk` on each. Creates `TranscriptChunk` + `ActionItem` records. |

#### On-Demand Tasks

| Task | Trigger | What it does |
|------|---------|-------------|
| `flush_single_speaker` | From `flush_speaker_buffers` | Runs GPT-4o-mini on speaker's text window. Gets previous summary for cumulative update. Saves `SpeakerAnalysis`, updates `Speaker` stats, broadcasts `analysis_update` via WebSocket. |
| `dispatch_bot_join` | `start-bot` endpoint | Blocking `create_bot()` API call. Saves `bot_id`, starts `poll_bot_status`. On failure → `status=FAILED`. |
| `poll_bot_status` | After bot creation | Polls Recall.ai every 15s. On `"in_call_recording"` → activates buffer, starts `poll_live_transcript`. On `"done"` → triggers pipeline. On `"fatal"` → marks failed. |
| `poll_live_transcript` | From `poll_bot_status` | Polls transcript API every 15s (fallback for regions without webhooks). Processes new segments. |
| `poll_audio_chunk` | From `poll_bot_status` | Every 30s: downloads recording, runs Azure Speech, processes only NEW segments. |
| `process_meeting_pipeline` | On meeting end | **Post-meeting pipeline:** Fetches transcript (3-strategy fallback), chunks it, processes each chunk with LLM, creates ActionItems, generates summary + title, triggers notifications + scoring. |
| `distribute_action_items` | After pipeline | Groups items by speaker. Resolves contacts via Speaker email → TeamDirectory (exact match → fuzzy match ≥60%). Sends Email + Slack notifications. |
| `compute_participant_scores` | After pipeline | Fuzzy-matches speakers to TeamDirectory. Computes avg performance_score from SpeakerAnalysis. Creates UserMeetingScore records. |

#### Transcript Fetching Strategy (`_fetch_transcript` in pipeline)
1. If no Azure key: assemble from LiveTranscriptSegments (Deepgram live segments)
2. If Azure configured: skip live segments, use higher-quality Azure
3. Try Recall.ai transcript API → assemble
4. Download recording MP4 → Whisper/Azure transcription
5. Fallback: return existing `full_transcript` field

---

### 6.4 Views & API Endpoints

#### REST API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| **Meetings** | | | |
| GET | `/api/meetings/` | JWT | List user's meetings (filterable, searchable, paginated) |
| POST | `/api/meetings/` | JWT | Create meeting (meeting_url, title, target_topics, etc.) |
| GET | `/api/meetings/{id}/` | JWT | Meeting detail with nested action_items + transcript_chunks |
| DELETE | `/api/meetings/{id}/` | JWT | Delete meeting |
| POST | `/api/meetings/{id}/start-bot/` | JWT | Deploy Recall.ai bot to meeting |
| POST | `/api/meetings/{id}/end-bot/` | JWT | Make bot leave, trigger processing |
| POST | `/api/meetings/{id}/reprocess/` | JWT | Wipe results, re-run pipeline |
| POST | `/api/meetings/{id}/send-notifications/` | JWT | Send action item notifications |
| GET | `/api/meetings/{id}/live-status/` | JWT | Current speaker stats + recent 30 segments |
| **Action Items** | | | |
| GET | `/api/meetings/action-items/` | JWT | List action items (filterable) |
| POST | `/api/meetings/action-items/{id}/toggle-complete/` | JWT | Toggle completion |
| DELETE | `/api/meetings/action-items/{id}/` | JWT | Delete action item |
| **Team Directory** | | | |
| GET | `/api/team-directory/` | JWT | List team members |
| POST | `/api/team-directory/` | JWT | Add team member |
| PUT | `/api/team-directory/{id}/` | JWT | Update team member |
| DELETE | `/api/team-directory/{id}/` | JWT | Delete team member |
| POST | `/api/team-directory/{id}/send-credentials/` | JWT | Email login credentials |
| GET | `/api/team-directory/{id}/profile/` | JWT | Gamified profile (scores, leaderboard, charts) |
| **Auth** | | | |
| POST | `/api/accounts/register/` | Public | Register user |
| POST | `/api/accounts/login/` | Public | Login → JWT tokens |
| GET | `/api/accounts/profile/` | JWT | Get user profile |
| GET/POST | `/api/accounts/language-preferences/` | JWT | Get/set language profile + AI hint generation |
| POST | `/api/token/refresh/` | Public | Refresh JWT access token |

#### Webhook Endpoints (unauthenticated — called by Recall.ai)

| Endpoint | Description |
|----------|-------------|
| `POST /api/webhooks/recall/` | Bot status changes (joining, recording, done, failed). Updates meeting status, activates/deactivates buffer, triggers pipeline. |
| `POST /api/webhooks/recall/transcript/` | Real-time transcript segments. Creates Speakers, saves LiveTranscriptSegments, transliterates Urdu/Hindi → Roman Urdu, buffers for analysis, broadcasts to WebSocket. |

#### Internal Endpoint

| Endpoint | Description |
|----------|-------------|
| `POST /api/meetings/internal_broadcast/` | HTTP bridge for Celery → Daphne WebSocket messages (because InMemoryChannelLayer is in-process only). |

---

### 6.5 WebSocket System

#### Connection
```
ws(s)://{host}:8000/ws/meetings/{meeting_id}/
```

#### Consumer: `MeetingConsumer` (AsyncJsonWebsocketConsumer)
- **On connect:** Joins channel group `meeting_{meeting_id}`, sends full snapshot
- **Keepalive:** Responds to `ping` with `pong`
- **Channel layer:** InMemoryChannelLayer (Daphne in-process only)

#### Event Types Pushed to Client

| Event Type | When | Data |
|------------|------|------|
| `snapshot` | On WS connect | Full state: meeting info, all speakers with latest analysis, recent 30 feed segments |
| `transcript_segment` | Every few seconds (live) | `speaker_id`, `speaker_name`, `text`, `start_time`, `end_time`, `word_count`, `talk_time_seconds` |
| `speaker_joined` | New participant detected | `speaker_id`, `speaker_name` |
| `analysis_update` | Every ~60s (live) | `speaker_id`, `performance_score`, `sentiment`, `summary`, `key_points`, `topic_coverage`, `one_line_quote` |
| `status_change` | Status transitions | `status` (e.g., "in_progress", "processing", "completed") |
| `transcript_chunk` | Post-meeting processing | `chunk_index`, `raw_text`, `summary`, `key_decisions` |
| `action_item` | Post-meeting processing | Full action item object |
| `summary_update` | Post-meeting | `summary` (final executive summary) |
| `transcript_update` | Post-meeting | `transcript` (full text), `title` |

#### Broadcast Module (`broadcast.py`)
Solves the InMemoryChannelLayer limitation:
- **From Daphne process:** Direct `channel_layer.group_send()` ✅
- **From Celery worker:** HTTP POST to `http://127.0.0.1:8000/api/meetings/internal_broadcast/` → Daphne receives and forwards to channel layer

---

### 6.6 Transliteration Engine

**File:** `meetings/utils/transliterate.py` (434 lines)

**Problem:** Deepgram with `language="multi"` may output Urdu speech as:
- Arabic/Nastaliq script (correct Urdu): `میں لیپ ٹاپ استعمال کر رہا ہوں`
- Devanagari script (misidentified as Hindi): `मैं लैपटॉप इस्तेमाल कर रहा हूं`

**Solution:** Rule-based transliteration (no API calls, runs in microseconds):
```
Arabic script → Roman Urdu:    "میں لیپ ٹاپ استعمال کر رہا ہوں" → "mein laptop istemaal kar raha hun"
Devanagari → Roman Urdu:       "मैं लैपटॉप इस्तेमाल कर रहा हूं" → "mein laptop istemaal kar raha hun"
English → Pass-through:        "How are you doing?" → "How are you doing?"
```

**Architecture:**
1. `transliterate_mixed(text)` — Main entry point
2. Fast path: pure Latin text → return unchanged
3. Per-token processing:
   - Check Urdu word map (150+ entries) → exact match
   - Check Hindi word map (150+ entries) → exact match
   - Fallback: character-by-character transliteration via `urdu_to_roman()` or `devanagari_to_roman()`
4. English tokens pass through unchanged

**Data maps:**
- `_WORD_MAP`: 150+ common Urdu words → Roman Urdu (pronouns, verbs, particles, tech terms)
- `_DEVANAGARI_WORD_MAP`: Matching Hindi word map
- `_CHAR_MAP`: 50+ Arabic character → Latin mappings
- `_DEVANAGARI_CHAR_MAP`: 60+ Devanagari character → Latin mappings
- `_DIGRAPH_MAP`: 16 multi-char combos (کھ→kh, گھ→gh, etc.)

---

### 6.7 Transcript Buffer

**File:** `meetings/transcript_buffer.py` (187 lines)

In-memory, per-speaker buffer that accumulates live transcript segments between Celery Beat flushes.

**Components:**
- `SpeakerBuffer` (dataclass): thread-safe buffer per speaker with lock, segments list, word count tracking
- `TranscriptBufferManager` (singleton): manages all buffers, tracks active meetings

**Flow:**
1. Webhook receives segment → `buffer_manager.append(meeting_id, speaker_id, ...)`
2. Celery Beat (every 60s) → `flush_speaker_buffers` task
3. For each speaker with ≥5 words → `buffer.flush()` drains segments → `flush_single_speaker` task
4. LLM analyses the window → result saved to `SpeakerAnalysis` + broadcast

---

## 7. Frontend — React

### 7.1 Routing & Pages

| Path | Component | Auth | Description |
|------|-----------|------|-------------|
| `/login` | Login | Public | Email/password login |
| `/register` | Register | Public | 3-step wizard (personal → company → language prefs) |
| `/dashboard` | Dashboard | Protected | Meeting list with stats, filters, new meeting button |
| `/meetings` | Dashboard | Protected | Same as dashboard |
| `/meetings/:id` | MeetingDetail | Protected | **Core page** — live dashboard, tabs, WebSocket |
| `/admin` | Admin | Protected | Profile settings (personal, company, preferences) |
| `/team` | TeamDirectory | Protected | Team member CRUD with search |
| `/team/:id` | UserProfile | Protected | Gamified profile with ranks, charts, achievements |
| `*` | → `/dashboard` | — | Catch-all redirect |

### Key Pages Detail

#### MeetingDetail.jsx (708 lines) — The Core Page
- **5 tabs:** Summary | Live Dashboard | Transcript | Actions | Chunks
- **Action buttons:** Start Bot, End Bot, Reprocess, Delete
- **Live bar:** Status text + WebSocket connection indicator (green/red dot)
- **Auto-switches** to Live tab when meeting goes in_progress
- **Safety polling:** fetches meeting every 3s during transitional states
- Handles all WebSocket event types (see §7.3)

#### Dashboard.jsx
- Stats grid: Total sessions, This week, Completed, Action items
- Meeting list with status filters (All / Live / Pending / Completed)
- Platform detection from URL (Zoom/Teams/GMeet badges)
- Polls every 10 seconds

#### Register.jsx — 3-Step Wizard
1. **Step 1:** Name, email, password
2. **Step 2:** Company name, size, industry, country
3. **Step 3:** Primary language, secondary language, meeting platform
   - Supports: English, Urdu, Arabic, Hindi, Spanish, French, German, Turkish
   - On submit: triggers AI hint phrase generation (Celery task)

#### UserProfile.jsx — Gamified Profiles
- **Rank system:** Bronze (0-30) → Silver (31-50) → Gold (51-70) → Platinum (71-85) → Diamond (86-100)
- **XP bar** with progress to next rank
- **Achievements:** First Blood, MVP, Clutch, Team Player, Legend
- **Charts:** Performance Radar, Sparkline (last 10), Sentiment Timeline
- **Leaderboard** with mini sparklines
- **Confetti animation** on Diamond-level scores

---

### 7.2 Components

| Component | Description |
|-----------|-------------|
| `Layout.jsx` | Fixed left sidebar (w-64) with nav links + user info |
| `ProtectedRoute.jsx` | Auth guard — redirects to `/login` if not authenticated |
| `NewMeetingModal.jsx` | Slide-in panel (380px) for creating meetings. Fields: link, title, topics, transcription mode, summary language. |
| `LiveDashboard.jsx` | **Real-time dashboard** — speaker cards (avatar, word count, talk time, sentiment, performance bar, live summary) + live transcript feed (newest first, speaker-colored) |
| `ActionItemList.jsx` | Action items with toggle checkboxes + "Send Notifications" button |
| `MeetingCard.jsx` | Legacy card component (Dashboard uses inline rows instead) |

---

### 7.3 WebSocket Integration

#### Hook: `useWebSocket(meetingId, onMessage)` → `{ connected }`
- **URL:** `ws(s)://{hostname}:8000/ws/meetings/{meetingId}/`
- **Key design:** `onMessage` stored in a ref so connection only reconnects when `meetingId` changes — NOT on re-render (prevents missed events)
- **Auto-reconnect** after 3 seconds on close
- **Clean teardown** on unmount

#### Message Handling (in `MeetingDetail.jsx`)

| Message Type | State Update |
|---|---|
| `snapshot` | Hydrates `liveSpeakers` + `liveFeed` (merges with existing, doesn't overwrite) |
| `status_change` | Updates `meeting.status`; on "completed" → full re-fetch |
| `summary_update` | Sets `meeting.final_summary` directly |
| `transcript_update` | Sets `meeting.full_transcript` + optional title |
| `transcript_chunk` | Appends to `meeting.transcript_chunks` (deduplicates by chunk_index) |
| `action_item` | Appends to `meeting.action_items` (deduplicates by id) |
| `speaker_joined` | Adds to `liveSpeakers` with initial 0 values |
| `transcript_segment` | Prepends to `liveFeed`, updates speaker stats (word_count, talk_time, is_speaking) |
| `analysis_update` | Updates speaker's performance_score, sentiment, summary, key_points, topic_coverage |

**Data flow timeline:**
1. Page loads → REST API fetch (meeting + live status)
2. WebSocket connects → `snapshot` hydrates live state
3. During meeting → `transcript_segment` + `analysis_update` stream in real-time
4. Meeting ends → `status_change(processing)` → `transcript_chunk` × N → `action_item` × N → `summary_update` → `transcript_update` → `status_change(completed)` → full re-fetch

---

### 7.4 API Client

**File:** `src/api/client.js`

- **Base URL:** `/api` (proxied to `http://127.0.0.1:8000` by Vite)
- **Request interceptor:** Attaches `Bearer {access_token}` from localStorage
- **Response interceptor:** On 401 → tries `/api/token/refresh/` → retries request. On refresh failure → clears tokens → redirects to `/login`

All API functions are named exports: `getMeetings`, `getMeeting`, `createMeeting`, `startBot`, `endBot`, `getLiveStatus`, `sendNotifications`, `getTeamDirectory`, `getTeamMemberProfile`, etc.

---

### 7.5 Auth System

**File:** `src/context/AuthContext.jsx`

- React Context providing: `user`, `loading`, `login()`, `register()`, `logout()`
- On mount: checks `localStorage.access_token` → validates via `getProfile()` API call
- JWT tokens stored in `localStorage` (access + refresh)
- `useAuth()` hook for consuming auth state

---

### 7.6 Design System

**Theme:** Dark mode throughout with void-black backgrounds.

**CSS Custom Properties (`:root`):**
- **Backgrounds:** `--bg-void` (#06070D) → `--bg-deep` → `--bg-surface` → `--bg-raised` → `--bg-card` → `--bg-hover`
- **Text:** `--text-primary` (#F0F2FF), `--text-secondary` (#8B92B8), `--text-muted`, `--text-accent` (#6C63FF)
- **Accents:** Violet (#6C63FF), Cyan (#00C896), Rose (#FF6B6B), Amber (#FFB800)
- **Fonts:** Display: 'Syne', Body: 'DM Sans' (Google Fonts)

**Visual effects:**
- Ambient floating orbs with blur
- Noise texture overlay
- Animated skeleton loading states
- Pulse dot for live indicators
- Glass-card design pattern
- Gradient accent buttons

**Styling approach:** Hybrid — Tailwind utility classes + custom CSS classes in `index.css` (795 lines) + inline `<style>` blocks in some pages + separate CSS files for complex pages.

---

## 8. Data Flow — End-to-End

### Phase 1: Meeting Setup
```
User creates meeting (URL, title, topics)
  → POST /api/meetings/
  → Meeting record saved (status: pending)
```

### Phase 2: Bot Deployment
```
User clicks "Start Bot"
  → POST /api/meetings/{id}/start-bot/
  → dispatch_bot_join task → RecallService.create_bot()
  → Bot joins meeting with Deepgram Nova-3 streaming
  → poll_bot_status starts (every 15s)
  → Status: bot_joining → in_progress
  → TranscriptBufferManager activated
```

### Phase 3: Live Meeting
```
Every few seconds:
  Recall.ai → POST /api/webhooks/recall/transcript/
  → Transliterate (Urdu/Hindi → Roman Urdu)
  → Save LiveTranscriptSegment
  → Buffer for speaker analysis
  → Broadcast transcript_segment via WebSocket → Frontend live feed

Every 60 seconds (Celery Beat):
  flush_speaker_buffers → GPT-4o-mini analysis per speaker
  → Save SpeakerAnalysis
  → Broadcast analysis_update → Frontend speaker cards update

  process_live_chunks → Group segments into 1-min chunks
  → LLM process_chunk → Extract summary, decisions, action items
  → Broadcast transcript_chunk + action_item → Frontend tabs update
```

### Phase 4: Post-Meeting Processing
```
Bot leaves (user clicks End Bot or meeting ends naturally)
  → Status: processing
  → process_meeting_pipeline task:
    1. Fetch/build full transcript (3-strategy fallback)
    2. Chunk transcript (60s windows)
    3. Process each chunk with LLM
    4. Create ActionItems
    5. Generate final summary + title
    6. Broadcast results via WebSocket
  → Status: completed

  → distribute_action_items task:
    - Fuzzy-match speakers to TeamDirectory (≥60% similarity)
    - Send Email + Slack notifications

  → compute_participant_scores task:
    - Match speakers to TeamDirectory
    - Create UserMeetingScore records for profiles
```

---

## 9. Multilingual Pipeline

The system handles **Urdu-English code-switching** at every layer:

| Layer | How Language is Handled |
|-------|------------------------|
| **Deepgram Nova-3** (live) | `language: "multi"` — auto-detects English vs Urdu per segment. May output Urdu as Arabic script or Hindi/Devanagari. |
| **Transliteration** (live) | Converts Arabic script + Devanagari → Roman Urdu. English passes through unchanged. |
| **Live LLM analysis** | GPT-4o-mini receives mixed text, outputs analysis in English. Handles Urdu/English transparently. |
| **Azure Speech** (post-meeting) | Urdu + English code-switching with speaker diarization. AI-generated hint phrases boost accuracy. Two modes: hints and detect-then-lock. |
| **Whisper** (fallback) | Language-aware prompting. Roman Urdu mode forces `language="en"` for Latin output. |
| **Post-meeting LLM** | Translates everything to English. Extracts action items in English. Summary in user's chosen language. |
| **Registration** | User selects primary + secondary language → triggers AI hint phrase generation (~80 phrases tailored to language pair + industry). |

---

## 10. Running the Application

### Prerequisites
- Python 3.10+, Node.js 18+, Redis server, MySQL (or SQLite for dev)
- Ngrok for webhook tunneling

### Terminal 1 — Ngrok
```powershell
ngrok http 8000
# Copy HTTPS URL → paste into backend/.env as WEBHOOK_BASE_URL
```

### Terminal 2 — Django Server
```powershell
cd backend
venv\Scripts\activate
python manage.py runserver
```

### Terminal 3 — Celery Worker
```powershell
cd backend
venv\Scripts\activate
celery -A config worker -l info --pool=solo
```

### Terminal 4 — Celery Beat
```powershell
cd backend
venv\Scripts\activate
celery -A config beat -l info
```

### Terminal 5 — Frontend
```powershell
cd frontend
npm run dev
```

**Access:** `http://localhost:5173`

---

## 11. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Deepgram via Recall.ai** (not self-hosted) | Recall.ai handles the Deepgram session, WebSocket connection, and audio routing. No custom audio intake server needed. |
| **`language: "multi"`** (not `"ur"` or `"en"`) | Allows Deepgram to correctly identify English vs Urdu per segment. Setting `"ur"` mangled English; setting `"en"` didn't work for Urdu. |
| **Rule-based transliteration** (not LLM) | Runs in microseconds, no API cost, no latency. Good enough for live display. |
| **InMemoryChannelLayer** (not Redis) | Simplicity for dev. Requires HTTP bridge from Celery → Daphne for WebSocket broadcasts. |
| **GPT-4o-mini** (not GPT-4o) | Cost-effective for high-frequency 60s analysis windows. Adequate for sentiment/scoring tasks. |
| **Fuzzy matching** (≥60% threshold) | Speaker names from meetings often don't exactly match TeamDirectory entries. Uses `difflib.SequenceMatcher`. |
| **3-strategy transcript fallback** | Maximizes reliability: live segments → Recall API → download + Whisper/Azure. |
| **Per-speaker buffering** | Enables individual speaker analysis rather than whole-meeting chunks. More granular insights. |

---

## 12. Known Constraints & Gotchas

| Constraint | Details |
|------------|---------|
| **InMemoryChannelLayer** | WebSocket broadcasts from Celery must go through HTTP bridge (`/api/meetings/internal_broadcast/`). In production, switch to Redis channel layer. |
| **Ngrok required** | Recall.ai webhooks need a public HTTPS URL. Ngrok must be running and URL updated in `.env`. |
| **5 terminals required** | Ngrok, Django, Celery worker, Celery beat, Vite dev server all run simultaneously. |
| **WebSocket port hardcoded** | Frontend `useWebSocket.js` hardcodes port `8000`. Must change for production. |
| **Deepgram multi-language** | May output Urdu as Hindi/Devanagari. Transliteration handles both, but quality varies. |
| **CORS wide open** | `CORS_ALLOW_ALL_ORIGINS = True` in settings. Lock down for production. |
| **No rate limiting** | Internal broadcast endpoint is AllowAny with no rate limiting. |
| **SQLite fallback** | If MySQL is unavailable, falls back to SQLite. Not suitable for concurrent Celery workers. |
| **Token storage** | JWTs stored in localStorage (XSS-vulnerable). Consider httpOnly cookies for production. |
