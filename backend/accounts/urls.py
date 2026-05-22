"""
URL routes for the accounts app.
"""

from django.urls import path
from . import views

app_name = "accounts"

urlpatterns = [
    path("register/",             views.RegisterView.as_view(),             name="register"),
    path("login/",                views.LoginView.as_view(),                name="login"),
    path("profile/",              views.ProfileView.as_view(),              name="profile"),
    path("update-slack-id/",      views.UpdateSlackIdView.as_view(),        name="update-slack-id"),
    path("language-preferences/", views.LanguagePreferencesView.as_view(), name="language-preferences"),
]
