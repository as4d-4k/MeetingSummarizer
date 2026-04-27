"""Test Gemini transcription directly on the recording file."""
import django, os, time
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from django.conf import settings
from google import genai

print(f"API Key: {settings.GOOGLE_API_KEY[:10]}...")

client = genai.Client(api_key=settings.GOOGLE_API_KEY)

# Upload the audio
audio_path = os.path.join(settings.BASE_DIR, "media", "recordings", "meeting_17.mp4")
print(f"Uploading {audio_path} ({os.path.getsize(audio_path)} bytes)...")

try:
    uploaded_file = client.files.upload(file=audio_path)
    print(f"Upload state: {uploaded_file.state}")
    print(f"File name: {uploaded_file.name}")
    print(f"MIME type: {uploaded_file.mime_type}")

    # Wait for processing
    while uploaded_file.state == "PROCESSING":
        print("  waiting for processing...")
        time.sleep(2)
        uploaded_file = client.files.get(name=uploaded_file.name)

    print(f"Final state: {uploaded_file.state}")

    if uploaded_file.state != "ACTIVE":
        print(f"ERROR: File not active, state={uploaded_file.state}")
        exit(1)

    # Transcribe
    print("Requesting transcription from Gemini...")
    response = client.models.generate_content(
        model="gemini-2.5-flash",
        contents=[
            uploaded_file,
            "Transcribe this meeting audio EXACTLY as spoken. "
            "The speakers mix Urdu and English (code-switching). "
            "Write Urdu words in Roman Urdu (Latin script) and English words normally. "
            "Format as a plain transcript with speaker labels if possible. "
            "Do NOT summarize — provide the full word-for-word transcription."
        ],
    )

    transcript = response.text.strip()
    print(f"\n{'='*60}")
    print(f"TRANSCRIPT ({len(transcript)} chars):")
    print(f"{'='*60}")
    print(transcript)
    print(f"{'='*60}")

    # Cleanup
    try:
        client.files.delete(name=uploaded_file.name)
    except:
        pass

except Exception as exc:
    print(f"\nERROR: {type(exc).__name__}: {exc}")
    import traceback
    traceback.print_exc()
