"""
Views for user registration, login, profile, and language preferences.
"""

import logging
from django.utils import timezone
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView
from django.contrib.auth import get_user_model

from .serializers import (
    RegisterSerializer,
    UserSerializer,
    CustomTokenObtainPairSerializer,
)
from .models import UserLanguageProfile

User = get_user_model()
logger = logging.getLogger(__name__)


# ── Industry → domain vocabulary ──────────────────────────────────────────────
INDUSTRY_DOMAINS = {
    "technology": "software engineering, agile, sprint, deployment, API, backend, frontend, cloud, DevOps, Kubernetes, microservices, CI/CD, pull request, repository, debugging",
    "finance":    "quarterly earnings, portfolio, revenue, P&L, ROI, liquidity, derivatives, hedge fund, fiscal year, budget, cashflow, dividend, equity, balance sheet",
    "medical":    "diagnosis, treatment, patient, clinical trial, prescription, prognosis, surgery, radiology, oncology, pathology, pharma, dosage, therapy, EHR",
    "education":  "curriculum, syllabus, assessment, pedagogy, learning outcomes, accreditation, lecture, seminar, thesis, research, plagiarism, scholarship, enrollment",
    "legal":      "litigation, contract, plaintiff, defendant, jurisdiction, deposition, affidavit, injunction, subpoena, verdict, statute, compliance, liability, arbitration",
    "general":    "meeting, agenda, action items, follow-up, stakeholder, deadline, project, deliverable, timeline, milestone, review, approval",
}

# ── Language code → display name ──────────────────────────────────────────────
LANGUAGE_NAMES = {
    "en-US": "English (US)",
    "ur-PK": "Urdu (Pakistani)",
    "ar-SA": "Arabic (Saudi)",
    "hi-IN": "Hindi (India)",
    "es-ES": "Spanish (Spain)",
    "fr-FR": "French",
    "de-DE": "German",
    "tr-TR": "Turkish",
}


def _generate_hints_with_openai(primary_lang: str, secondary_lang: str, industry: str) -> list[str]:
    """
    Call OpenAI GPT to generate ~80 speech recognition hint phrases
    tailored to the user's language(s) and industry.
    """
    from django.conf import settings
    from openai import OpenAI

    client = OpenAI(api_key=settings.OPENAI_API_KEY)

    domain_vocab   = INDUSTRY_DOMAINS.get(industry, INDUSTRY_DOMAINS["general"])
    primary_name   = LANGUAGE_NAMES.get(primary_lang,   primary_lang)
    secondary_name = LANGUAGE_NAMES.get(secondary_lang, secondary_lang)

    prompt = f"""You are a speech recognition expert helping train an Azure Speech Service recognizer.

A user's meetings are primarily in {primary_name} with occasional {secondary_name} code-switching.
Their professional domain is: {industry.upper()}.
Domain vocabulary includes: {domain_vocab}.

Generate exactly 80 diverse speech recognition hint phrases that:
1. Include common {primary_name} conversational phrases
2. Include industry-specific terms from the {industry} domain
3. Include short bilingual phrases mixing {primary_name} and {secondary_name}
4. Include numbers, dates, and common filler words in both languages
5. Include names of common software/tools if industry is technology
6. Cover a range from 1–6 words per phrase

Return ONLY a JSON array of strings, nothing else. Example format:
["phrase one", "phrase two", ...]

Do NOT include any explanation, markdown, or extra text outside the JSON array."""

    try:
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.7,
            max_tokens=2000,
        )
        import json
        raw = resp.choices[0].message.content.strip()
        # Strip markdown code fences if present
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.strip()
        phrases = json.loads(raw)
        if not isinstance(phrases, list):
            raise ValueError("Expected a list")
        # Ensure all items are strings and strip blanks
        phrases = [str(p).strip() for p in phrases if str(p).strip()]
        logger.info("Generated %d hint phrases for %s/%s", len(phrases), primary_lang, industry)
        return phrases[:100]  # cap at 100 safety
    except Exception as exc:
        logger.error("OpenAI hint generation failed: %s", exc)
        # Return a minimal fallback so Azure still gets some hints
        return ["hello", "yes", "no", "okay", "thank you", "meeting", "action item", "deadline"]


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Registration & Auth Views
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class RegisterView(generics.CreateAPIView):
    """POST /api/accounts/register/ — create a new user account."""

    queryset = User.objects.all()
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            {
                "message": "Registration successful.",
                "user": UserSerializer(user).data,
            },
            status=status.HTTP_201_CREATED,
        )


class LoginView(TokenObtainPairView):
    """POST /api/accounts/login/ — returns JWT access + refresh tokens."""

    permission_classes = [permissions.AllowAny]
    serializer_class = CustomTokenObtainPairSerializer


class ProfileView(APIView):
    """GET /api/accounts/profile/ — returns logged-in user's profile."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)


# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Language Preferences + Hint Generation
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


class LanguagePreferencesView(APIView):
    """
    GET  /api/accounts/language-preferences/
        Returns the user's stored language profile + hint metadata.

    POST /api/accounts/language-preferences/
        Saves primary_language, secondary_language, industry.
        Triggers OpenAI to generate/regenerate the hint phrase table.
        Returns the saved profile immediately (hint generation happens synchronously
        so the frontend can poll or wait for the response).
    """

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.language_profile
            return Response({
                "primary_language":    profile.primary_language,
                "secondary_language":  profile.secondary_language,
                "industry":            profile.industry,
                "hints_count":         len(profile.hint_phrases),
                "hints_generated_at":  profile.hints_generated_at,
            })
        except UserLanguageProfile.DoesNotExist:
            return Response({
                "primary_language":   "en-US",
                "secondary_language": "en-US",
                "industry":           "general",
                "hints_count":        0,
                "hints_generated_at": None,
            })

    def post(self, request):
        primary_lang   = request.data.get("primary_language",   "en-US")
        secondary_lang = request.data.get("secondary_language", "en-US")
        industry       = request.data.get("industry",           "general")

        # Validate
        valid_langs = set(LANGUAGE_NAMES.keys())
        if primary_lang not in valid_langs:
            primary_lang = "en-US"
        if secondary_lang not in valid_langs:
            secondary_lang = "en-US"
        if industry not in INDUSTRY_DOMAINS:
            industry = "general"

        # Generate hints via OpenAI
        hints = _generate_hints_with_openai(primary_lang, secondary_lang, industry)

        # Upsert the profile
        profile, _ = UserLanguageProfile.objects.get_or_create(user=request.user)
        profile.primary_language   = primary_lang
        profile.secondary_language = secondary_lang
        profile.industry           = industry
        profile.hint_phrases       = hints
        profile.hints_generated_at = timezone.now()
        profile.save()

        logger.info(
            "Language profile saved for user=%s lang=%s/%s industry=%s hints=%d",
            request.user.email, primary_lang, secondary_lang, industry, len(hints),
        )

        return Response({
            "message":            "Language preferences saved and hints generated.",
            "primary_language":   profile.primary_language,
            "secondary_language": profile.secondary_language,
            "industry":           profile.industry,
            "hints_count":        len(profile.hint_phrases),
            "hints_generated_at": profile.hints_generated_at,
        }, status=status.HTTP_200_OK)
