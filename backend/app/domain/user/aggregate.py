"""User Aggregate Root"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, UTC

from app.domain.user.constraints import (
    ALLOWED_AVATAR_URLS,
    PLAYER_NAME_MAX_LENGTH,
    PLAYER_NAME_MIN_LENGTH,
)
from app.domain.user.value_objects import Email, Role

_PASSWORD_HASH_MAX_LENGTH = 1024


class User:
    """
    User aggregate root.

    Invariants:
    1. id is stable once assigned
    2. password_hash stores an already-hashed value; plaintext never reaches
       the domain — hashing is done by the application layer before construction
    3. role is immutable after creation (admin escalation requires a separate flow)
    """

    def __init__(
        self,
        id: str,
        email: str,
        player_name: str,
        role: Role,
        password_hash: str,
        avatar_url: str | None = None,
        created_at: datetime | None = None,
        password_version: int = 0,
        is_active: bool = True,
        is_email_verified: bool = False,
        totp_secret: str | None = None,
        mfa_enabled: bool = False,
        totp_last_used_at: datetime | None = None,
        ia_recent_accuracy: float = 0.0,
    ) -> None:
        if not isinstance(role, Role):
            raise ValueError("role must be a Role instance")
        if not isinstance(password_hash, str) or len(password_hash) > _PASSWORD_HASH_MAX_LENGTH:
            raise ValueError(
                f"password_hash must be a string of at most {_PASSWORD_HASH_MAX_LENGTH} characters"
            )
        self.id = id
        self.email = self._validate_email(email)
        self.player_name = self._validate_player_name(player_name)
        self.role = role
        self.password_hash = password_hash
        self.avatar_url = avatar_url
        self.created_at = created_at or datetime.now(UTC)
        self.password_version = password_version
        self.is_active = is_active
        self.is_email_verified = is_email_verified
        self.totp_secret = totp_secret
        self.mfa_enabled = mfa_enabled
        self.totp_last_used_at = totp_last_used_at
        # Rolling Initial-Answer accuracy over the last 10 completed sessions
        # (0.0–1.0). Drives concrete-fading on the Star-1 path renderer
        # (spec §17). Recomputed by the session-service at end_session.
        self.ia_recent_accuracy = ia_recent_accuracy
        # Derived progression flag, hydrated by the application layer from the
        # session repository when the profile is read. False until at least one
        # session records a correct Initial-Answer phase. See the Star-5 unlock
        # gate in app.application.session_service.
        self.ia_unlock_earned: bool = False

    @classmethod
    def create(
        cls,
        email: str,
        player_name: str,
        role: Role,
        password_hash: str,
    ) -> User:
        """Factory — assigns a new id. Password is already hashed by the caller."""
        return cls(
            id=str(uuid.uuid4()),
            email=email,
            player_name=player_name,
            role=role,
            password_hash=password_hash,
        )

    AVATAR_URL_MAX_LENGTH = 2048

    @staticmethod
    def _validate_email(email: str) -> str:
        if not isinstance(email, str):
            raise ValueError("email must be a string")
        return Email(email).value

    @staticmethod
    def _validate_player_name(player_name: str) -> str:
        if not isinstance(player_name, str):
            raise ValueError("player_name must be a string")
        cleaned = player_name.strip()
        if len(cleaned) < PLAYER_NAME_MIN_LENGTH:
            raise ValueError(
                f"player_name must be at least {PLAYER_NAME_MIN_LENGTH} characters"
            )
        if len(cleaned) > PLAYER_NAME_MAX_LENGTH:
            raise ValueError(
                f"player_name exceeds {PLAYER_NAME_MAX_LENGTH} characters"
            )
        return cleaned

    def rename(self, player_name: str) -> None:
        self.player_name = self._validate_player_name(player_name)

    def update_avatar(self, avatar_url: str | None) -> None:
        """Validate and assign a new avatar URL (B-BUG-19).

        ``None`` (or an empty/whitespace string) clears the avatar. Otherwise
        the URL must be one of the application's shipped avatars. The allowlist
        is enforced here so every caller — the HTTP schema, internal services,
        and any future non-HTTP callers — gets the same guarantee rather than
        relying on the Pydantic layer alone.
        """
        if avatar_url is None:
            self.avatar_url = None
            return
        if not isinstance(avatar_url, str):
            raise ValueError("avatar_url must be a string or None")
        cleaned = avatar_url.strip()
        if not cleaned:
            self.avatar_url = None
            return
        if len(cleaned) > self.AVATAR_URL_MAX_LENGTH:
            raise ValueError(
                f"avatar_url exceeds {self.AVATAR_URL_MAX_LENGTH} characters"
            )
        if cleaned not in ALLOWED_AVATAR_URLS:
            raise ValueError("Invalid avatar URL")
        self.avatar_url = cleaned

    def update_ia_accuracy(self, value: float) -> None:
        """Set the rolling Initial-Answer accuracy (0.0–1.0). Clamps out-of-
        range inputs rather than raising — callers come from the session
        completion path and a slightly drifted reading is preferable to a
        rolled-back end-session. Domain command lives here so cross-aggregate
        callers don't mutate the field directly (B-ARCH-19)."""
        if math.isnan(value) or math.isinf(value):
            value = 0.0
        if value < 0.0:
            value = 0.0
        elif value > 1.0:
            value = 1.0
        self.ia_recent_accuracy = value

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_teacher(self) -> bool:
        return self.role == Role.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == Role.STUDENT
