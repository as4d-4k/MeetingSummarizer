"""
Celery application configuration.

Start worker:
    celery -A config worker -l info --pool=solo   (Windows)
    celery -A config worker -l info                (Linux/Mac)
"""

import os
from celery import Celery

# Set the default Django settings module
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

app = Celery("meeting_summarizer")

# Read config from Django settings, namespace='CELERY' means all
# Celery-related settings must be prefixed with CELERY_ in settings.py
app.config_from_object("django.conf:settings", namespace="CELERY")

# Auto-discover tasks in all installed apps (looks for tasks.py in each app)
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """Simple debug task to verify Celery is working."""
    print(f"Request: {self.request!r}")
