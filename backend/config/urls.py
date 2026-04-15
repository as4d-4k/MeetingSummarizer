"""
Root URL configuration for the Meeting Summarizer project.
"""

from django.contrib import admin
from django.urls import path, include
from rest_framework_simplejwt.views import TokenRefreshView

urlpatterns = [
    # Admin
    path("admin/", admin.site.urls),
    # API routes
    path("api/accounts/", include("accounts.urls")),
    path("api/meetings/", include("meetings.urls")),
    # JWT token refresh (shared endpoint)
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    # Recall.ai webhook (unauthenticated)
    path("api/webhooks/", include("meetings.webhook_urls")),
    # DRF browsable API login (dev only)
    path("api-auth/", include("rest_framework.urls")),
]
