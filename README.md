<p align="center">
  <h1 align="center">MeetingIntel</h1>
  <p align="center">
    <strong>Autonomous Multilingual Meeting Summarizer</strong>
  </p>
  <p align="center">
    Real-time transcription · Live speaker analysis · Intelligent action item extraction<br/>
    with native <strong>Urdu-English code-switching</strong> support
  </p>
</p>

---

## Overview

MeetingIntel is a full-stack autonomous meeting intelligence platform that:

1. **Deploys a bot** to Google Meet, Zoom, or Microsoft Teams via [Recall.ai](https://recall.ai)
2. **Transcribes speech in real-time** using Deepgram Nova-3 with Urdu/Hindi → Roman Urdu transliteration
3. **Analyses speakers live** — every 60 seconds, GPT-4o-mini scores each speaker on performance (0–100), sentiment, topic coverage, and key points
4. **Processes the full meeting post-call** — assembles transcript, chunks it, extracts action items, generates an executive summary
5. **Distributes action items** — fuzzy-matches speakers to a Team Directory and sends personalized Email + Slack notifications
6. **Tracks team performance** — gamified user profiles with ranks (Bronze → Diamond), achievements, performance charts, and leaderboards

Built for **Urdu-English bilingual environments** where speakers frequently code-switch between languages.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MEETING PLATFORM                              │
│               (Google Meet / Zoom / MS Teams)                       │
└───────────────────────────┬─────────────────────────────────────────┘
                            │ Audio stream
                            ▼
┌───────────────────────────────────────────┐
│              RECALL.AI BOT                │
│  • Joins meeting as a participant         │
│  • Streams audio to Deepgram Nova-3       │
│  • Sends transcript webhooks to backend   │
│  • Records MP4 for post-meeting pipeline  │
└─────────────┬──────────────┬──────────────┘
              │ Webhooks     │ Status webhooks
              ▼              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   DJANGO BACKEND (Daphne ASGI)                      │
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
│         ▼                                         │                 │
│  ┌──────────────────────────────┐    ┌───────────┴────────────┐    │
│  │  Transcript Buffer           │    │  Broadcast Module       │    │
│  │  (Per-speaker, in-memory)   │───▶│  (HTTP bridge for       │    │
│  └──────┬───────────────────────┘    │   Celery → Daphne)     │    │
│         ▼                            └────────────────────────┘    │
│  ┌──────────────────────────────────────────────┐                  │
│  │  CELERY WORKERS + BEAT                        │                  │
│  │  Every 60s:                                   │                  │
│  │   • flush_speaker_buffers → GPT-4o-mini      │                  │
│  │   • process_live_chunks → LLM chunk analysis  │                  │
│  │  On meeting end:                              │                  │
│  │   • process_meeting_pipeline                  │                  │
│  │   • distribute_action_items                   │                  │
│  │   • compute_participant_scores                │                  │
│  └──────────────────────────────────────────────┘                  │
│                                                                     │
│  Services: RecallService · LLMService · TranscriptionService       │
│            AzureSpeechService · NotificationService                 │
│                                                                     │
│  Database: MySQL (prod) / SQLite (dev)    Redis: Celery broker     │
└─────────────────────────────────────────────────────────────────────┘
              │ WebSocket push
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   REACT FRONTEND (Vite)                             │
│                                                                     │
│  Dashboard · Meeting Detail · Live Dashboard · Team Directory      │
│  User Profiles (gamified) · Action Items · Notifications           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Backend

| Component | Technology |
|-----------|-----------|
| Framework | Django 4.2 + Django REST Framework |
| ASGI Server | Daphne (Django Channels) |
| Task Queue | Celery 5.3 + Redis |
| Auth | JWT (SimpleJWT) |
| Live Transcription | Deepgram Nova-3 via Recall.ai |
| Post-meeting STT | Azure Speech / OpenAI Whisper |
| LLM | GPT-4o-mini via LangChain (Pydantic structured output) |
| Meeting Bot | Recall.ai |
| Notifications | Email (SMTP) + Slack SDK |

### Frontend

| Component | Technology |
|-----------|-----------|
| Framework | React 19 |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS 4.2 + Custom CSS |
| HTTP Client | Axios |
| Routing | React Router DOM 7 |
| Fonts | Syne (display) + DM Sans (body) |

---

## Key Features

### 🎙 Live Transcription + Transliteration

Deepgram Nova-3 streams multilingual transcription via Recall.ai. A custom **rule-based transliteration engine** converts Urdu (Arabic script) and Hindi (Devanagari) → Roman Urdu in microseconds — no API calls needed. English passes through unchanged.

```
Arabic script  →  "میں لیپ ٹاپ استعمال کر رہا ہوں"  →  "mein laptop istemaal kar raha hun"
Devanagari     →  "मैं लैपटॉप इस्तेमाल कर रहा हूं"  →  "mein laptop istemaal kar raha hun"
English        →  "How are you doing?"                →  "How are you doing?"
```

### 📊 Real-Time Speaker Analysis

Every 60 seconds, Celery flushes each speaker's speech buffer to GPT-4o-mini. Returns:
- **Performance score** (0–100)
- **Sentiment** (positive / neutral / negative)
- **Key points** and **topic coverage**
- **Notable quote**

Results push instantly to the frontend via WebSocket.

### ⚡ Post-Meeting Pipeline

On meeting end, an automated pipeline:
1. Assembles the full transcript (3-strategy fallback: live segments → Recall API → recording download)
2. Chunks transcript into 60-second windows
3. LLM extracts action items with speaker assignment
4. Generates executive summary + title
5. Auto-routes action items via **Email** and **Slack** to matched team members

### 🏆 Gamified Team Profiles

| Rank | Score Range | Badge |
|------|-----------|-------|
| Bronze | 0 – 30 | 🥉 |
| Silver | 31 – 50 | 🥈 |
| Gold | 51 – 70 | 🥇 |
| Platinum | 71 – 85 | 💎 |
| Diamond | 86 – 100 | 👑 |

**Achievements:** First Blood · MVP · Clutch · Team Player · Legend

**Profile features:** Performance radar chart · Sparkline trends · Sentiment timeline · XP bar · Recent match history · Team leaderboard · Confetti animation for Diamond rank

---

## Multilingual NLP Pipeline

```
Audio Capture (Recall.ai bot)
     │
     ▼
Deepgram Nova-3 STT (language: "multi")
     │ Outputs English, Urdu (Arabic script), or Hindi (Devanagari)
     ▼
Script Detection (regex: Arabic \u0600-\u06FF, Devanagari \u0900-\u097F, Latin)
     │
     ▼
Transliteration Engine
     │ • 150+ word lookup maps (Urdu + Hindi)
     │ • 50+ character maps + digraph handling
     │ • English tokens pass through unchanged
     ▼
Roman Urdu + English mixed output
     │
     ▼
GPT-4o-mini Analysis → English-only structured output
```

---

## Project Structure

```
NLPproject/
├── backend/
│   ├── config/
│   │   ├── settings.py               # Django settings
│   │   ├── urls.py                   # Root URL config
│   │   ├── asgi.py                   # ASGI + WebSocket routing
│   │   ├── celery.py                 # Celery app config
│   │   └── wsgi.py
│   ├── accounts/
│   │   ├── models.py                 # User + UserLanguageProfile
│   │   ├── views.py                  # Auth + language preferences + AI hint generation
│   │   ├── serializers.py
│   │   └── urls.py
│   ├── meetings/
│   │   ├── models.py                 # Meeting, Speaker, LiveTranscriptSegment,
│   │   │                             # SpeakerAnalysis, TranscriptChunk, ActionItem,
│   │   │                             # TeamDirectory, UserMeetingScore
│   │   ├── views.py                  # ViewSets + webhook handlers + broadcast bridge
│   │   ├── serializers.py
│   │   ├── tasks.py                  # Celery tasks — bot polling, analysis, pipeline
│   │   ├── consumers.py              # WebSocket consumer
│   │   ├── broadcast.py              # Celery → Daphne HTTP bridge
│   │   ├── transcript_buffer.py      # In-memory per-speaker buffer
│   │   ├── services/
│   │   │   ├── recall_service.py     # Recall.ai API client
│   │   │   ├── llm_service.py        # GPT-4o-mini via LangChain
│   │   │   ├── transcription_service.py  # Whisper + transcript chunking
│   │   │   ├── azure_speech.py       # Azure Speech SDK
│   │   │   └── notification_service.py   # Email + Slack notifications
│   │   └── utils/
│   │       └── transliterate.py      # Urdu/Hindi → Roman Urdu engine
│   ├── .env                          # API keys (not committed)
│   ├── requirements.txt
│   └── manage.py
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx             # Email/password login
│   │   │   ├── Register.jsx          # 3-step registration wizard
│   │   │   ├── Dashboard.jsx         # Meeting list + stats
│   │   │   ├── MeetingDetail.jsx     # Live dashboard + 5 tabs
│   │   │   ├── Admin.jsx             # Profile settings
│   │   │   ├── TeamDirectory.jsx     # Team member CRUD
│   │   │   ├── UserProfile.jsx       # Gamified profile page
│   │   │   ├── TeamProfile.jsx       # Team member profile view
│   │   │   └── profileCharts.jsx     # SVG chart components
│   │   ├── components/
│   │   │   ├── Layout.jsx            # Sidebar layout
│   │   │   ├── ProtectedRoute.jsx    # Auth guard
│   │   │   ├── NewMeetingModal.jsx   # Meeting creation panel
│   │   │   ├── LiveDashboard.jsx     # Real-time speaker cards + feed
│   │   │   └── ActionItemList.jsx    # Action items + notifications
│   │   ├── hooks/
│   │   │   └── useWebSocket.js       # Auto-reconnecting WebSocket hook
│   │   ├── context/
│   │   │   └── AuthContext.jsx       # JWT token management
│   │   └── api/
│   │       └── client.js             # Axios + JWT + all API functions
│   ├── index.css                     # Design system (dark theme)
│   ├── vite.config.js
│   └── package.json
│
├── PROJECT_DOCUMENTATION.md          # Detailed architecture documentation
└── .gitignore
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **Redis** running on `localhost:6379`
- **MySQL** (production) or **SQLite** (development — no setup needed)
- **ngrok** (for Recall.ai webhook tunnel)

---

## Environment Variables

Create `backend/.env`:

```env
# Django
SECRET_KEY=your-secret-key
DEBUG=True

# Database (optional — defaults to SQLite if omitted)
DB_NAME=meeting_database
DB_USER=root
DB_PASSWORD=your-password
DB_HOST=127.0.0.1
DB_PORT=3306

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# API Keys
OPENAI_API_KEY=sk-...               # GPT-4o-mini + Whisper
RECALL_AI_API_KEY=your-key           # Recall.ai bot management

# Webhook (update each time ngrok restarts)
WEBHOOK_BASE_URL=https://xxxx.ngrok-free.app

# Azure Speech (optional — enables multilingual transcription)
AZURE_SPEECH_KEY=your-azure-key
AZURE_SPEECH_REGION=southeastasia

# Notifications (optional)
SLACK_BOT_TOKEN=xoxb-...
EMAIL_HOST_USER=user@gmail.com
EMAIL_HOST_PASSWORD=app-password
DEFAULT_FROM_EMAIL=user@gmail.com
```

---

## Setup & Running

### First-Time Setup

```bash
# Backend
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser

# Frontend
cd frontend
npm install
```

### Running the App (5 terminals)

Start in order:

| Terminal | Command | Purpose |
|----------|---------|---------|
| **1** | `ngrok http 8000` | Webhook tunnel (copy HTTPS URL → `.env` `WEBHOOK_BASE_URL`) |
| **2** | `python manage.py runserver` | Django server (activate venv first) |
| **3** | `celery -A config worker -l info --pool=solo` | Celery worker (activate venv first) |
| **4** | `celery -A config beat -l info` | Celery Beat scheduler (activate venv first) |
| **5** | `npm run dev` | React frontend |

Open **http://localhost:5173** → Register → Login → Create meeting → Deploy bot.

---

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/accounts/register/` | Register new user |
| POST | `/api/accounts/login/` | JWT login → access + refresh tokens |
| GET | `/api/accounts/profile/` | Get user profile |
| GET/POST | `/api/accounts/language-preferences/` | Language profile + AI hint generation |

### Meetings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/meetings/` | List user's meetings |
| POST | `/api/meetings/` | Create meeting (URL, title, topics, language) |
| GET | `/api/meetings/{id}/` | Meeting detail (transcript, chunks, actions) |
| DELETE | `/api/meetings/{id}/` | Delete meeting |
| POST | `/api/meetings/{id}/start-bot/` | Deploy Recall.ai bot |
| POST | `/api/meetings/{id}/end-bot/` | End bot → trigger pipeline |
| POST | `/api/meetings/{id}/reprocess/` | Re-run AI pipeline |
| POST | `/api/meetings/{id}/send-notifications/` | Send action item notifications |
| GET | `/api/meetings/{id}/live-status/` | Current speaker stats snapshot |

### Team Directory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/team-directory/` | List team members |
| POST | `/api/team-directory/` | Add member (key auto-generated) |
| PUT | `/api/team-directory/{id}/` | Update member |
| DELETE | `/api/team-directory/{id}/` | Delete member |
| POST | `/api/team-directory/{id}/send-credentials/` | Email login credentials |
| GET | `/api/team-directory/{id}/profile/` | Gamified profile with scores + leaderboard |

### WebSocket

```
ws://localhost:8000/ws/meetings/{id}/
```

**Events:** `snapshot` · `transcript_segment` · `speaker_joined` · `analysis_update` · `status_change` · `transcript_chunk` · `action_item` · `summary_update` · `transcript_update` · `participant_scores_batch`

---

## Data Flow

### During Live Meeting
```
Recall.ai webhook → Transliterate → Save LiveTranscriptSegment → WS broadcast
                                                                      │
Every 60s (Celery Beat):                                              │
  flush_speaker_buffers → GPT-4o-mini → SpeakerAnalysis → WS broadcast
  process_live_chunks → LLM chunk analysis → TranscriptChunk → WS broadcast
```

### Post-Meeting Pipeline
```
Bot leaves → 30s delay → process_meeting_pipeline
  ├── Assemble transcript (live segments → Recall API → recording → Whisper)
  ├── Chunk into 60s windows → LLM process each
  ├── Extract action items with speaker assignment
  ├── Generate executive summary + title
  ├── distribute_action_items → fuzzy-match → Email + Slack
  └── compute_participant_scores → UserMeetingScore records
```

---

## License

This project was built as a **Final Year Project** for the NLP Course at FAST NUCES.
