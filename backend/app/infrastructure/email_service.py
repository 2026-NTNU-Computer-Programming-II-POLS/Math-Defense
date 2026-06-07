"""Thin SMTP wrapper. If smtp_host is not configured the send calls are no-ops."""
from __future__ import annotations

import html as html_lib
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.config import Settings

logger = logging.getLogger(__name__)


class SmtpEmailService:
    def __init__(self, settings: "Settings") -> None:
        self._settings = settings

    def _enabled(self) -> bool:
        return bool(self._settings.smtp_host)

    def _send(self, to: str, subject: str, html_body: str) -> None:
        if not self._enabled():
            logger.debug("SMTP not configured — skipping email to %s (%s)", to, subject)
            return
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = self._settings.smtp_from
        msg["To"] = to
        msg.attach(MIMEText(html_body, "html"))
        if self._settings.smtp_tls:
            with smtplib.SMTP(self._settings.smtp_host, self._settings.smtp_port) as smtp:
                smtp.ehlo()
                smtp.starttls()
                if self._settings.smtp_user:
                    smtp.login(self._settings.smtp_user, self._settings.smtp_password)
                smtp.sendmail(self._settings.smtp_from, to, msg.as_string())
        else:
            with smtplib.SMTP(self._settings.smtp_host, self._settings.smtp_port) as smtp:
                if self._settings.smtp_user:
                    smtp.login(self._settings.smtp_user, self._settings.smtp_password)
                smtp.sendmail(self._settings.smtp_from, to, msg.as_string())

    def send_welcome_email(self, to: str, player_name: str) -> None:
        safe_name = html_lib.escape(player_name)
        safe_login = html_lib.escape(f"{self._settings.frontend_url}/auth")
        body = f"""
        <p>Hi {safe_name},</p>
        <p>Welcome to Math Defense! Your account is ready.</p>
        <p>You can sign in any time here: <a href="{safe_login}">Sign in</a></p>
        <p>If you did not create this account, you can safely ignore this email.</p>
        """
        self._send(to, "Welcome to Math Defense", body)

    def send_account_exists_notice(self, to: str, player_name: str) -> None:
        safe_name = html_lib.escape(player_name)
        safe_login = html_lib.escape(f"{self._settings.frontend_url}/auth")
        body = f"""
        <p>Hi {safe_name},</p>
        <p>Someone (possibly you) just tried to create a Math Defense account
        with this email address. An account already exists, so no new account
        was created.</p>
        <p>If it was you, please sign in instead:
        <a href="{safe_login}">Sign in</a></p>
        <p>If it was not you, you can safely ignore this email — your account
        has not changed. Consider updating your password if you suspect
        someone else knows it.</p>
        """
        self._send(to, "A Math Defense account already exists for this email", body)
