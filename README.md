# MeetingIntel — Autonomous Multilingual Meeting Summarizer & Tracker

> Final Year NLP Project — Real-time AI-powered meeting intelligence with live transcription, speaker analytics, and automated summaries.

---

## What It Does

A bot joins your **Google Meet** call, listens to everything, and gives you:

- **Live transcription** (English, Urdu, Roman Urdu, mixed)
- **Per-speaker performance cards** updated every 60 seconds (score, sentiment, summary)
- **Topic coverage tracking** in real time
- **Post-meeting summary** with action items, key decisions, and speaker breakdown
- **WebSocket-powered dashboard** — no page refresh needed

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Tailwind CSS |
| Backend | Django 4.2, Django REST Framework |
| Database | MySQL (local) |
| Task Queue | Celery + Redis |
| WebSockets | Django Channels + Redis |
| Bot | Recall.ai (joins Google Meet, captures audio) |
| Live Transcription | Recall.ai (Gladia) or Azure Speech (multilingual) |
| Post-Meeting Transcription | OpenAI Whisper |
| LLM (Summaries) | Google Gemini 2.0 Flash (live analysis), OpenAI GPT-4o-mini (post-meeting) |
| Speech Recognition | Azure Cognitive Services Speech SDK |

---

## Project Structure

```
NLPproject/
├── backend/
│   ├── config/              # Django settings, URLs, ASGI/WSGI, Celery config
│   ├── accounts/            # Custom User model, JWT auth, language profiles
│   ├── meetings/
│   │   ├── models.py        # Meeting, Speaker, ActionItem, TranscriptChunk, LiveTranscriptSegment, SpeakerAnalysis
│   │   ├── views.py         # REST API — CRUD, start-bot, end-bot, live-status, reprocess
│   │   ├── tasks.py         # Celery tasks — poll_bot_status, flush_speaker_buffers, process_meeting_pipeline
│   │   ├── consumers.py     # WebSocket consumer — broadcasts live data to frontend
│   │   ├── broadcast.py     # Channel layer helper — sends events to WebSocket groups
│   │   ├── transcript_buffer.py  # In-memory buffer for speaker speech windows
│   │   └── services/
│   │       ├── recall_service.py        # Recall.ai API (deploy bot, get transcript, download recording)
│   │       ├── azure_speech.py          # Azure Speech SDK (multilingual transcription from URL)
│   │       ├── transcription_service.py # Whisper + transcript chunking
│   │       └── llm_service.py           # Gemini/OpenAI — speaker analysis, chunk processing, final summary
│   ├── .env                 # API keys, DB config, webhook URL (not committed)
│   ├── requirements.txt
│   └── manage.py
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx        # JWT login
│   │   │   ├── Register.jsx     # User registration
│   │   │   ├── Dashboard.jsx    # Meeting list + create meeting modal
│   │   │   ├── MeetingDetail.jsx # Tabs: Summary, Live Dashboard, Transcript, Actions, Chunks
│   │   │   └── Admin.jsx        # Admin panel
│   │   ├── components/
│   │   │   ├── LiveDashboard.jsx  # Speaker cards + live transcript feed
│   │   │   ├── NewMeetingModal.jsx # Create meeting form (URL, topics, language settings)
│   │   │   ├── ActionItemList.jsx
│   │   │   ├── Layout.jsx
│   │   │   └── MeetingCard.jsx
│   │   ├── hooks/
│   │   │   └── useWebSocket.js   # Auto-reconnecting WebSocket hook
│   │   ├── context/
│   │   │   └── AuthContext.jsx   # JWT token management
│   │   └── api/
│   │       └── axios.js          # Configured axios instance
│   ├── index.css              # Full design system (dark theme)
│   └── package.json
│
├── CODEBASE_DOCUMENTATION.md  # Detailed architecture docs
├── TESTING_GUIDE.md           # Testing procedures
└── .gitignore
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **MySQL** running locally (database: `meeting_database`)
- **Redis** running on `localhost:6379`
- **ngrok** (for Recall.ai webhook tunnel)

---

## Environment Variables (`backend/.env`)

```env
# Django
SECRET_KEY=your-secret-key
DEBUG=True

# Database (MySQL)
DB_NAME=meeting_database
DB_USER=root
DB_PASSWORD=YourNewPassword
DB_HOST=127.0.0.1
DB_PORT=3306

# Redis
REDIS_URL=redis://127.0.0.1:6379/0

# API Keys
OPENAI_API_KEY=sk-proj-...           # For Whisper + GPT-4o-mini post-meeting summaries
GOOGLE_API_KEY=AIza...               # For Gemini 2.0 Flash live speaker analysis
RECALL_AI_API_KEY=your-hex-key       # Recall.ai bot management

# Webhook (update each time ngrok restarts)
WEBHOOK_BASE_URL=https://your-tunnel.ngrok-free.dev

# Azure Speech (optional — enables multilingual Urdu/English transcription)
AZURE_SPEECH_KEY=your-azure-key
AZURE_SPEECH_REGION=southeastasia
```

---

## First-Time Setup

### Backend
```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py createsuperuser
```

### Frontend
```powershell
cd frontend
npm install
```

---

## Running the App (5 Terminals)

Start in order. All terminals should `cd` into the project root first.

### Terminal 1 — ngrok (webhook tunnel)
```powershell
cd backend
ngrok http 8000
# Copy the HTTPS URL → paste into backend/.env as WEBHOOK_BASE_URL
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

### Terminal 4 — Celery Beat (scheduler)
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

Open **http://localhost:5173** → Register → Login → Create a meeting → Deploy bot.

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/accounts/register/` | Register new user |
| POST | `/api/accounts/login/` | JWT login (returns access + refresh tokens) |
| GET | `/api/meetings/` | List user's meetings |
| POST | `/api/meetings/` | Create meeting (URL, title, topics, language) |
| GET | `/api/meetings/{id}/` | Meeting detail (includes transcript, chunks, actions) |
| POST | `/api/meetings/{id}/start-bot/` | Deploy Recall.ai bot to Google Meet |
| POST | `/api/meetings/{id}/end-bot/` | Remove bot → triggers post-meeting pipeline |
| GET | `/api/meetings/{id}/live-status/` | Current speaker stats (snapshot) |
| POST | `/api/meetings/{id}/reprocess/` | Re-run the AI summary pipeline |
| WS | `ws://localhost:8000/ws/meetings/{id}/` | Live WebSocket (transcript, analysis, status) |

---

## How the Live System Works

```
Google Meet
    │
    ▼
Recall.ai Bot (joins call, captures audio)
    │
    ├──► poll_bot_status (every 15s) — detects recording start/end
    │
    ├──► poll_live_transcript (every 15s) — fetches new transcript segments
    │       OR
    ├──► poll_audio_chunk (every 30s) — downloads audio → Azure Speech SDK
    │
    ▼
LiveTranscriptSegment (saved to DB)
    │
    ├──► WebSocket broadcast → frontend LiveDashboard (instant)
    │
    └──► flush_speaker_buffers (every 60s via Celery Beat)
            │
            ▼
        flush_single_speaker → Gemini 2.0 Flash
            │
            ▼
        SpeakerAnalysis (score, sentiment, summary, topics)
            │
            ▼
        WebSocket broadcast → frontend SpeakerCard (instant)
```

### Post-Meeting Pipeline (after bot leaves)

```
end_bot API called
    │
    ▼
30s delay (Recall finalizes recording)
    │
    ▼
process_meeting_pipeline
    │
    ├── Attempt 1: Recall.ai transcript API
    ├── Attempt 2: Download recording → Whisper/Azure
    └── Attempt 3: Assemble from LiveTranscriptSegments in DB
    │
    ▼
Chunk transcript → GPT-4o-mini (per-chunk analysis)
    │
    ▼
Final summary + action items → save to DB → broadcast to UI
```

---

## Meeting Language Options

When creating a meeting, users can set:

| Setting | Options | Used For |
|---------|---------|----------|
| `live_language` | English, Urdu, Roman Urdu, Urdu-English Mix | Controls Azure Speech recognition language |
| `summary_language` | English, Urdu, Roman Urdu | Controls post-meeting summary output language |
| `transcription_mode` | auto, hints, skip | Azure transcription strategy |

> **Note:** Live speaker analysis summaries are always in English regardless of `live_language`.

---

## Key Design Decisions

1. **Recall.ai for bot management** — handles Google Meet joining, audio capture, and recording without needing a browser instance
2. **Azure Speech over Whisper for live** — Azure supports real-time multilingual (Urdu + English code-switching), Whisper is batch-only
3. **Celery Beat for periodic analysis** — `flush_speaker_buffers` runs every 60s, collecting speech windows per speaker
4. **WebSocket for instant UI** — Django Channels broadcasts every event (transcript, analysis, status) to the React frontend
5. **3-tier transcript fallback** — Recall API → recording download → DB segments, so the pipeline never fails if live transcription worked

---

## Git Workflow

```bash
git add .
git commit -m "your message"
git push
```

**Branches:**
- `main` — stable, MySQL database
- `supabase` — experimental PostgreSQL (Supabase) migration

---

## Team

Built as a Final Year Project — NLP Course, FAST NUCES.
