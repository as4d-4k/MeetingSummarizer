"""
meetings/services/notification_service.py
------------------------------------------
Handles sending action item notifications to meeting participants
via Email (Django send_mail) and Slack (slack_sdk).
"""

import logging
from datetime import datetime
from typing import Optional

from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils.html import strip_tags

logger = logging.getLogger(__name__)


class NotificationServiceError(Exception):
    pass


class NotificationService:
    """Sends action item notifications via Email and Slack."""

    def __init__(self):
        self.slack_token = getattr(settings, "SLACK_BOT_TOKEN", "")
        self.from_email = getattr(
            settings, "DEFAULT_FROM_EMAIL", "noreply@meetingintel.local"
        )

    # ── Email ─────────────────────────────────────────────────────────────

    def send_email_action_items(
        self,
        email: str,
        speaker_name: str,
        action_items: list,
        meeting_title: str,
        meeting_date: Optional[datetime] = None,
    ) -> bool:
        """
        Send a formatted email with the speaker's action items.
        Returns True on success, False on failure.
        """
        if not email:
            logger.warning("No email for speaker '%s' — skipping email", speaker_name)
            return False

        # Build the items list
        items_text = ""
        items_html = ""
        for i, item in enumerate(action_items, 1):
            task = item.get("task", item.get("task_description", ""))
            deadline = item.get("deadline", "")
            deadline_str = f" (Deadline: {deadline})" if deadline else ""

            items_text += f"  {i}. {task}{deadline_str}\n"
            deadline_html = f"<br><em style='color:#e67e22;'>Deadline: {deadline}</em>" if deadline else ""
            items_html += (
                f'<li style="margin-bottom:8px;">'
                f"{task}"
                f"{deadline_html}"
                f"</li>"
            )

        date_str = (
            meeting_date.strftime("%B %d, %Y at %I:%M %p") if meeting_date else "N/A"
        )

        subject = f"Your Action Items from: {meeting_title}"

        # Plain text version
        text_body = (
            f"Hi {speaker_name},\n\n"
            f"Here are your action items from the meeting:\n"
            f"Meeting: {meeting_title}\n"
            f"Date: {date_str}\n\n"
            f"Action Items:\n{items_text}\n"
            f"Please complete these items by their respective deadlines.\n\n"
            f"— MeetingIntel"
        )

        # HTML version
        html_body = f"""
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        padding: 24px; border-radius: 12px 12px 0 0; color: white;">
                <h2 style="margin: 0 0 8px;">📋 Your Action Items</h2>
                <p style="margin: 0; opacity: 0.9;">From: {meeting_title}</p>
                <p style="margin: 4px 0 0; opacity: 0.7; font-size: 14px;">📅 {date_str}</p>
            </div>
            <div style="background: #f8f9fa; padding: 24px; border-radius: 0 0 12px 12px;
                        border: 1px solid #e9ecef; border-top: none;">
                <p style="color: #495057;">Hi <strong>{speaker_name}</strong>,</p>
                <p style="color: #495057;">The following action items were assigned to you:</p>
                <ol style="padding-left: 20px; color: #212529;">
                    {items_html}
                </ol>
                <hr style="border: none; border-top: 1px solid #dee2e6; margin: 20px 0;">
                <p style="color: #6c757d; font-size: 13px;">
                    Please complete these by their respective deadlines.<br>
                    <em>— MeetingIntel</em>
                </p>
            </div>
        </div>
        """

        try:
            send_mail(
                subject=subject,
                message=text_body,
                from_email=self.from_email,
                recipient_list=[email],
                html_message=html_body,
                fail_silently=False,
            )
            logger.info("Email sent to %s (%s)", speaker_name, email)
            return True
        except Exception as exc:
            logger.error(
                "Failed to send email to %s (%s): %s", speaker_name, email, exc
            )
            return False

    # ── Slack ─────────────────────────────────────────────────────────────

    def send_slack_action_items(
        self,
        slack_id: str,
        speaker_name: str,
        action_items: list,
        meeting_title: str,
        meeting_date: Optional[datetime] = None,
    ) -> bool:
        """
        Send a formatted Slack DM with the speaker's action items.
        Returns True on success, False on failure.
        """
        if not slack_id:
            logger.warning(
                "No Slack ID for speaker '%s' — skipping Slack", speaker_name
            )
            return False

        if not self.slack_token:
            logger.warning("SLACK_BOT_TOKEN not configured — skipping Slack")
            return False

        try:
            from slack_sdk import WebClient
            from slack_sdk.errors import SlackApiError
        except ImportError:
            logger.error("slack_sdk not installed. Run: pip install slack_sdk")
            return False

        date_str = (
            meeting_date.strftime("%B %d, %Y at %I:%M %p") if meeting_date else "N/A"
        )

        # Build Slack Block Kit message
        blocks = [
            {
                "type": "header",
                "text": {
                    "type": "plain_text",
                    "text": "📋 Your Action Items",
                    "emoji": True,
                },
            },
            {
                "type": "section",
                "fields": [
                    {
                        "type": "mrkdwn",
                        "text": f"*Meeting:*\n{meeting_title}",
                    },
                    {
                        "type": "mrkdwn",
                        "text": f"*Date:*\n{date_str}",
                    },
                ],
            },
            {"type": "divider"},
        ]

        for i, item in enumerate(action_items, 1):
            task = item.get("task", item.get("task_description", ""))
            deadline = item.get("deadline", "")
            text = f"*{i}.* {task}"
            if deadline:
                text += f"\n⏰ _Deadline: {deadline}_"

            blocks.append(
                {
                    "type": "section",
                    "text": {"type": "mrkdwn", "text": text},
                }
            )

        blocks.append({"type": "divider"})
        blocks.append(
            {
                "type": "context",
                "elements": [
                    {
                        "type": "mrkdwn",
                        "text": "💡 _Sent automatically by MeetingIntel_",
                    }
                ],
            }
        )

        try:
            client = WebClient(token=self.slack_token)
            client.chat_postMessage(
                channel=slack_id,
                text=f"You have {len(action_items)} action item(s) from: {meeting_title}",
                blocks=blocks,
            )
            logger.info("Slack message sent to %s (%s)", speaker_name, slack_id)
            return True
        except Exception as exc:
            logger.error(
                "Failed to send Slack message to %s (%s): %s",
                speaker_name,
                slack_id,
                exc,
            )
            return False

    def send_credentials_email(self, email: str, name: str, slack_id: str, key: str) -> bool:
        if not email:
            return False
            
        subject = "Your MeetingIntel Profile Login Credentials"
        
        text_body = (
            f"Hi {name},\n\n"
            f"Your team profile has been created.\n"
            f"Please use these credentials to log in and view your profile:\n\n"
            f"Email: {email}\n"
            f"Key: {key}\n\n"
            f"IMPORTANT: To ensure your meeting stats are tracked correctly, please make sure your Zoom, Google Meet, or Microsoft Teams display name exactly matches the name registered in our system:\n"
            f"Registered Display Name: {name}\n"
            f"(You can change your display name from your respective platform's account settings.)\n\n"
            f"— MeetingIntel"
        )
        
        html_body = f"""
        <div style="font-family: sans-serif; max-width: 500px; padding: 20px;">
            <h2>Welcome to MeetingIntel</h2>
            <p>Hi <strong>{name}</strong>,</p>
            <p>Please use this key and your email to log in and see your profile:</p>
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px;">
                <p><strong>Email:</strong> {email}</p>
                <p><strong>Key:</strong> {key}</p>
            </div>
            
            <div style="background: #fff3cd; color: #856404; padding: 15px; border-radius: 8px; margin-top: 20px; border: 1px solid #ffeeba;">
                <h3 style="margin-top: 0; font-size: 16px;">⚠️ Important Note for Meeting Tracking</h3>
                <p style="margin-bottom: 0;">To ensure your meeting stats and action items are tracked correctly, please make sure your <strong>Zoom, Google Meet, or Microsoft Teams</strong> display name exactly matches the name registered in our system:</p>
                <p style="font-size: 18px; text-align: center; font-weight: bold; margin: 10px 0;">{name}</p>
                <p style="margin-bottom: 0; font-size: 14px;"><em>(You can update your display name from your respective platform's account settings.)</em></p>
            </div>
            <p style="margin-top: 20px;"><em>— MeetingIntel</em></p>
        </div>
        """
        
        try:
            send_mail(
                subject=subject,
                message=text_body,
                from_email=self.from_email,
                recipient_list=[email],
                html_message=html_body,
                fail_silently=False,
            )
            logger.info("Credentials email sent to %s (%s)", name, email)
            return True
        except Exception as exc:
            logger.error("Failed to send credentials to %s: %s", email, exc)
            return False
