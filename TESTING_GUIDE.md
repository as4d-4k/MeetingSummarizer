# Running & Testing Guide — Meeting Summarizer

## Prerequisites

Make sure these are installed and running:
- **Python 3.11+** with `venv`
- **Node.js 18+** with npm
- **MySQL** (running, with database `meeting_summarizer` created)
- **Redis** (running on port 6379)

---

## Step 1: Start the Project (3 Terminals)

### Terminal 1 — Django Backend
```powershell
cd backend
.\venv\Scripts\activate
python manage.py runserver 0.0.0.0:8000
```
> Runs at **http://localhost:8000**

### Terminal 2 — Celery Worker
```powershell
cd backend
.\venv\Scripts\activate
celery -A config worker -l info --pool=solo
```
> Processes async tasks (transcript processing, LLM pipeline)

### Terminal 3 — React Frontend
```powershell
cd frontend
npm run dev
```
> Runs at **http://localhost:5173**

---

## Step 2: Testing — Feature by Feature

### Test 1: User Registration
1. Open **http://localhost:5173/register**
2. Fill in:
   - Email: `yourname@test.com`
   - Username: `yourname`
   - Password: `TestPass123!` (must be 8+ chars, not too common)
   - Confirm Password: `TestPass123!`
3. Click **Register**
4. **Expected:** Redirected to login page with success

### Test 2: User Login
1. On the login page, enter the email and password from Test 1
2. Click **Login**
3. **Expected:** Redirected to Dashboard. Sidebar shows your email.

### Test 3: Dashboard (Empty State)
1. After login, you should see the Dashboard
2. **Expected:** Stats show 0 for everything, "Create your first meeting" message appears

### Test 4: Create a Meeting
1. Click the **"+ New Meeting"** button (top right)
2. Fill in:
   - Meeting URL: `https://meet.google.com/abc-defg-hij` (any URL)
   - Title: `Test Meeting` (optional)
3. Click **Create**
4. **Expected:** New meeting card appears on dashboard with status "Pending"

### Test 5: View Meeting Detail
1. Click on the meeting card
2. **Expected:** Meeting detail page with 4 tabs (Summary, Transcript, Action Items, Chunks)
3. All tabs should show empty state messages
4. "Start Bot" button should be visible (since status is pending)

### Test 6: LLM Pipeline Test (No Real Meeting Needed)
This tests the AI processing with a sample Urdu/English transcript.

```powershell
cd backend
.\venv\Scripts\activate
python manage.py test_pipeline
```

**Expected output:**
```
[OK] Created test meeting: ID=X

--- Step 1: Chunking transcript ---
   1 chunk(s) created

--- Step 2: Processing chunks with GPT-4o ---
   [OK] Summary: The meeting focused on the Q3 marketing budget...
   [OK] Action items found: 2
      -> [Bilal] Prepare a detailed influencer marketing proposal...
      -> [Sara] Analyze Q2 conversion data...

--- Step 3: Generating final summary ---
   Title: Q3 Marketing Budget and Q2 Performance Review
   ...

=== Pipeline test PASSED ===
Meeting ID: X
```

Then go to **http://localhost:5173/meetings/X** to see the processed meeting in the UI.

### Test 7: View Processed Meeting in UI
1. Go to the meeting created by `test_pipeline` (or click it on Dashboard)
2. **Summary tab:** Should show the AI-generated executive summary
3. **Action Items tab:** Should show 2 items (Bilal's proposal, Sara's analysis)
4. **Chunks tab:** Should show 1 chunk with summary and expandable raw text

### Test 8: Toggle Action Items
1. On the Action Items tab, click the checkbox next to an item
2. **Expected:** Item toggles between completed/not completed
3. Refresh the page — state should persist

### Test 9: Delete a Meeting
1. On the meeting detail page, click the **trash icon** (🗑)
2. Confirm the deletion
3. **Expected:** Redirected to dashboard, meeting is gone

### Test 10: Django Admin
1. Open **http://localhost:8000/admin/**
2. Login with:
   - Email: `admin@admin.com`
   - Password: `admin123`
3. **Expected:** You can see and manage Users, Meetings, Action Items, Transcript Chunks
4. Click on a Meeting — you'll see inline Action Items and Chunks

### Test 11: API Direct Testing (Optional)
Use a tool like **Postman** or **curl**:

```bash
# Login and get token
curl -X POST http://localhost:8000/api/accounts/login/ \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!"}'

# Use the access token for subsequent requests
curl http://localhost:8000/api/meetings/ \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>"
```

### Test 12: Real Meeting Bot (Requires Recall.ai)
> Only if you have a valid Recall.ai API key with credits.

1. Create a real Google Meet at [meet.google.com](https://meet.google.com)
2. **Join the meeting yourself** (stay in the call)
3. In the app, create a meeting with that Google Meet URL
4. Click **"Start Bot"**
5. In Google Meet, **admit the bot** from the waiting room
6. Talk for 1-2 minutes (mix Urdu and English for best demo)
7. **End the meeting** — the bot will leave
8. Recall.ai sends a webhook → Celery processes → AI summarizes
9. Refresh the meeting page to see results

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `ModuleNotFoundError` | Make sure venv is activated: `.\venv\Scripts\activate` |
| `OperationalError: can't connect to MySQL` | Start MySQL service, check `.env` credentials |
| `redis.ConnectionError` | Start Redis: `redis-server` or check if Redis Windows service is running |
| `429 Rate Limit` on Gemini | Wait 1 minute and retry. Free tier: 5 requests/min, 20/day |
| Frontend shows blank page | Check browser console for errors. Make sure backend is on port 8000 |
| Login returns 401 | Password is case-sensitive. Try registering a new user |
| `celery@... ready` but tasks don't run | Ensure Redis is running and `REDIS_URL` in `.env` is correct |

---

## Test Accounts

| Email | Password | Role |
|---|---|---|
| `test@example.com` | `TestPass123!` | Regular user |
| `admin@admin.com` | `admin123` | Django admin |
