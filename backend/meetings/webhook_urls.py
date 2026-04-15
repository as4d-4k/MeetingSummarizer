"""
Webhook URL routes (unauthenticated).

These endpoints receive callbacks from external services like Recall.ai.
They are intentionally NOT behind JWT auth.
"""

from django.urls import path
from . import views

urlpatterns = [
    path("recall/", views.recall_webhook, name="recall-webhook"),
]
