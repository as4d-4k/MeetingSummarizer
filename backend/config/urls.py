"""
Root URL configuration for the Meeting Summarizer project.
"""

from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView
from rest_framework.routers import DefaultRouter
from meetings.views import TeamDirectoryViewSet

# Team Directory router (separate from meetings router)
team_router = DefaultRouter()
team_router.register(r"", TeamDirectoryViewSet, basename="team-directory")

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),
    # API routes
    path("api/accounts/", include("accounts.urls")),
    path("api/meetings/", include("meetings.urls")),
    path("api/team-directory/", include(team_router.urls)),
    # JWT token refresh (shared endpoint)
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # Recall.ai webhook (unauthenticated)
    path("api/webhooks/", include("meetings.webhook_urls")),
    # DRF browsable API login (dev only)
    path("api-auth/", include("rest_framework.urls")),
]
