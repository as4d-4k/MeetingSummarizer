import django, os
os.environ['DJANGO_SETTINGS_MODULE'] = 'config.settings'
django.setup()

from meetings.models import Meeting
from meetings.services import RecallService
from meetings.tasks import poll_bot_status

# Create the meeting
m = Meeting.objects.create(
    user_id=1,
    meeting_url='https://meet.google.com/ott-sazk-vdw',
    title='Live Real-World Test',
    status='bot_joining'
)
print(f"Meeting created: ID={m.id}")

# Deploy the bot
svc = RecallService()
bot = svc.create_bot('https://meet.google.com/ott-sazk-vdw')
bot_id = bot['id']
m.bot_id = bot_id
m.save()
print(f"Bot deployed: {bot_id}")

# Start polling
poll_bot_status.delay(m.id)
print(f"Polling started! Meeting ID={m.id}")
print("Now go to Google Meet and ADMIT the bot from the waiting room!")
