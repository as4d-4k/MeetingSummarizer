"""
Management command to test the full LLM pipeline with a sample
Urdu/English code-switched transcript -- no Recall.ai bot needed.

Usage:
    python manage.py test_pipeline
"""

import sys
import io
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

# Sample transcript simulating a real code-switched meeting
SAMPLE_TRANSCRIPT = """
Ahmed: Assalam o alaikum everyone, let's start the meeting. Today we need to discuss the Q3 marketing budget aur uska breakdown.

Sara: Ji Ahmed bhai, main ne spreadsheet ready ki hai. Total budget 50 lakh hai, jismein se 20 lakh digital marketing ke liye allocated hain.

Ahmed: Digital marketing ka breakdown kya hai? I want to know the split between social media ads aur Google Ads.

Sara: Social media ads ke liye 12 lakh aur Google Ads ke liye 8 lakh. Lekin mera suggestion hai ke hum influencer marketing mein bhi invest karein, at least 3 lakh.

Bilal: I agree with Sara. Influencer marketing is very effective these days. Humein top 5 influencers ki list banana chahiye by next Friday.

Ahmed: Good point. Bilal, can you take ownership of the influencer strategy? Ek detailed proposal ready karo with expected ROI.

Bilal: Sure, I'll have it ready by next Wednesday. Mujhe marketing team se bhi coordinate karna hoga.

Sara: Aur ek baat, humein Q2 campaign results bhi review karne hain. Conversion rate 3.2% tha jo humari expectation se thoda kam tha.

Ahmed: Yes, that's concerning. Sara, can you prepare a detailed analysis report on why the conversion rate dropped? Include recommendations for improvement.

Bilal: I think the landing page design was the issue. Humein A/B testing karni chahiye next quarter mein.

Ahmed: Agreed. So let me summarize the action items:
- Bilal will prepare the influencer marketing proposal by Wednesday
- Sara will analyze Q2 conversion data and prepare recommendations
- We'll allocate 3 lakh from the digital budget to influencer marketing
- A/B testing for landing pages will start in Q3

Sara: Sounds good. Kya koi aur agenda item hai?

Ahmed: Nahi, I think we're good. Let's meet again next Monday to review progress. Meeting adjourned. Allah Hafiz!
"""


class Command(BaseCommand):
    help = "Test the full LLM pipeline with a sample Urdu/English transcript"

    def handle(self, *args, **options):
        # Fix Windows console encoding
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

        from meetings.models import Meeting
        from meetings.services import TranscriptionService, LLMService

        # Get or create a test user
        user, _ = User.objects.get_or_create(
            email="test@example.com",
            defaults={"username": "testuser"},
        )

        # Create a test meeting
        meeting = Meeting.objects.create(
            user=user,
            meeting_url="https://meet.google.com/test-pipeline-demo",
            title="Pipeline Test - Code-Switched Meeting",
            full_transcript=SAMPLE_TRANSCRIPT.strip(),
            status=Meeting.Status.PROCESSING,
        )
        print(f"\n[OK] Created test meeting: ID={meeting.id}")

        # Step 1: Chunk the transcript
        print("\n--- Step 1: Chunking transcript ---")
        svc = TranscriptionService()
        chunks = svc.chunk_transcript(SAMPLE_TRANSCRIPT.strip())
        print(f"   {len(chunks)} chunk(s) created")
        for c in chunks:
            print(f"   Chunk #{c['chunk_index']}: {len(c['text'])} chars ({c['start']}s - {c['end']}s)")

        # Step 2: Process each chunk through LLM
        print("\n--- Step 2: Processing chunks with GPT-4o ---")
        llm = LLMService()
        chunk_results = []

        for chunk_data in chunks:
            print(f"   Processing chunk #{chunk_data['chunk_index']}...")
            result = llm.process_chunk(
                raw_text=chunk_data["text"],
                chunk_index=chunk_data["chunk_index"],
            )
            chunk_results.append(result)

            print(f"   [OK] Summary: {result.get('summary', 'N/A')[:120]}...")
            items = result.get("action_items", [])
            print(f"   [OK] Action items found: {len(items)}")
            for item in items:
                print(f"      -> [{item.get('assigned_to')}] {item.get('task')}")

        # Step 3: Generate final summary
        print("\n--- Step 3: Generating final summary ---")
        final = llm.generate_final_summary(chunk_results)

        print(f"\n   Title: {final.get('title', 'N/A')}")
        print(f"   Executive Summary: {final.get('executive_summary', 'N/A')}")
        print(f"   Key Topics: {final.get('key_topics', [])}")
        print(f"   Action Items: {len(final.get('overall_action_items', []))}")
        for item in final.get("overall_action_items", []):
            deadline = item.get("deadline") or "No deadline"
            print(f"      -> [{item.get('assigned_to')}] {item.get('task')} ({deadline})")

        # Save results to the meeting
        meeting.title = final.get("title", meeting.title)
        meeting.final_summary = final.get("executive_summary", "")
        meeting.status = Meeting.Status.COMPLETED
        meeting.save()

        print(f"\n=== Pipeline test PASSED ===")
        print(f"Meeting ID: {meeting.id}")
        print(f"View in browser: http://localhost:5173/meetings/{meeting.id}")
