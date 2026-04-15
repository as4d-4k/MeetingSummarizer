"""
URL routes for the meetings app.
Uses DRF routers for automatic ViewSet routing.
"""

from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

app_name = "meetings"

router = DefaultRouter()
router.register(r"", views.MeetingViewSet, basename="meeting")
router.register(r"action-items", views.ActionItemViewSet, basename="action-item")

urlpatterns = [
    path("", include(router.urls)),
]
