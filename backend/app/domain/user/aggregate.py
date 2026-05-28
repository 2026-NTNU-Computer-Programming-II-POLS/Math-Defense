"""User Aggregate Root"""
from __future__ import annotations

import math
import uuid
from datetime import datetime, UTC

import base64
import binascii

from app.domain.user.constraints import (
    ALLOWED_AVATAR_URLS,
    ALLOWED_ENDPOINT_HIT_FX_STYLES,
    ALLOWED_ENDPOINT_MARKER_STYLES,
    ENDPOINT_MARKER_DATAURL_MAX_LENGTH,
    ENDPOINT_MARKER_DATAURL_PREFIXES,
    ENDPOINT_MARKER_MAGIC_BYTES,
    ENDPOINT_MARKER_MAX_DIMENSION,
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
        endpoint_marker_style: str | None = None,
        endpoint_marker_custom_dataurl: str | None = None,
        endpoint_hit_fx: str | None = None,
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
        # Endpoint marker (P*) preferences — display-only, server-side
        # persisted so the choice follows the player across devices. None
        # means the player has not set this field and the FE should use its
        # local default (star / fragments).
        self.endpoint_marker_style: str | None = endpoint_marker_style
        self.endpoint_marker_custom_dataurl: str | None = endpoint_marker_custom_dataurl
        self.endpoint_hit_fx: str | None = endpoint_hit_fx

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

    def update_endpoint_marker(
        self,
        style: str | None,
        custom_dataurl: str | None,
        hit_fx: str | None,
    ) -> None:
        """Validate and assign endpoint-marker preferences in one atomic update.

        All three arguments are independently nullable; passing `None` clears
        the corresponding field. The aggregate enforces:

        - style ∈ ALLOWED_ENDPOINT_MARKER_STYLES or None
        - hit_fx ∈ ALLOWED_ENDPOINT_HIT_FX_STYLES or None
        - custom_dataurl is allowed only when style == 'custom'; otherwise the
          combination is rejected outright (we never silently drop user data)
        - custom_dataurl, when present, must be a valid base64 dataURL with a
          PNG or JPEG prefix, decode successfully, fit within the size cap,
          and start with the corresponding magic-byte sentinel
        """
        validated_style = self._validate_endpoint_marker_style(style)
        validated_fx = self._validate_endpoint_hit_fx(hit_fx)
        validated_dataurl = self._validate_endpoint_marker_dataurl(
            custom_dataurl, validated_style,
        )
        self.endpoint_marker_style = validated_style
        self.endpoint_marker_custom_dataurl = validated_dataurl
        self.endpoint_hit_fx = validated_fx

    @staticmethod
    def _validate_endpoint_marker_style(style: str | None) -> str | None:
        if style is None:
            return None
        if not isinstance(style, str):
            raise ValueError("endpoint_marker_style must be a string or None")
        if style not in ALLOWED_ENDPOINT_MARKER_STYLES:
            raise ValueError(
                f"endpoint_marker_style must be one of "
                f"{sorted(ALLOWED_ENDPOINT_MARKER_STYLES)}"
            )
        return style

    @staticmethod
    def _validate_endpoint_hit_fx(hit_fx: str | None) -> str | None:
        if hit_fx is None:
            return None
        if not isinstance(hit_fx, str):
            raise ValueError("endpoint_hit_fx must be a string or None")
        if hit_fx not in ALLOWED_ENDPOINT_HIT_FX_STYLES:
            raise ValueError(
                f"endpoint_hit_fx must be one of "
                f"{sorted(ALLOWED_ENDPOINT_HIT_FX_STYLES)}"
            )
        return hit_fx

    @staticmethod
    def _validate_endpoint_marker_dataurl(
        dataurl: str | None,
        style: str | None,
    ) -> str | None:
        if dataurl is None:
            return None
        if not isinstance(dataurl, str):
            raise ValueError("endpoint_marker_custom_dataurl must be a string or None")
        # Refuse the contradiction rather than silently clear: if the client
        # sends an image with a style other than 'custom', it's a bug or an
        # attempt to confuse the validation.
        if style != 'custom':
            raise ValueError(
                "endpoint_marker_custom_dataurl is only allowed when "
                "endpoint_marker_style == 'custom'"
            )
        if len(dataurl) > ENDPOINT_MARKER_DATAURL_MAX_LENGTH:
            raise ValueError(
                f"endpoint_marker_custom_dataurl exceeds "
                f"{ENDPOINT_MARKER_DATAURL_MAX_LENGTH} bytes"
            )
        matched_prefix: str | None = None
        for prefix in ENDPOINT_MARKER_DATAURL_PREFIXES:
            if dataurl.startswith(prefix):
                matched_prefix = prefix
                break
        if matched_prefix is None:
            raise ValueError(
                "endpoint_marker_custom_dataurl must start with one of: "
                f"{', '.join(ENDPOINT_MARKER_DATAURL_PREFIXES)}"
            )
        encoded = dataurl[len(matched_prefix):]
        if not encoded:
            raise ValueError("endpoint_marker_custom_dataurl has empty base64 payload")
        try:
            # validate=True rejects any non-base64 character; the FE produces
            # clean canvas.toDataURL output so this should always pass for
            # legitimate input.
            decoded = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as e:
            raise ValueError(
                "endpoint_marker_custom_dataurl base64 payload is invalid"
            ) from e
        magic = ENDPOINT_MARKER_MAGIC_BYTES[matched_prefix]
        if not decoded.startswith(magic):
            raise ValueError(
                "endpoint_marker_custom_dataurl bytes do not match the declared image format"
            )
        # PNG-only: parse the IHDR chunk's declared dimensions to reject
        # decompression-bomb headers (huge declared size in a small payload).
        # The PNG spec mandates IHDR is the first chunk: bytes 8-11 are the
        # chunk length, 12-15 the "IHDR" type, 16-19 the width, 20-23 the
        # height (all big-endian uint32). JPEG dimension parsing requires
        # walking SOF markers; we skip it because the FE never produces JPEG
        # and the 3 MB payload cap bounds any JPEG attack budget.
        if matched_prefix == 'data:image/png;base64,':
            if len(decoded) < 24 or decoded[12:16] != b'IHDR':
                raise ValueError(
                    "endpoint_marker_custom_dataurl PNG is missing its IHDR chunk"
                )
            width = int.from_bytes(decoded[16:20], 'big')
            height = int.from_bytes(decoded[20:24], 'big')
            if (
                width == 0 or height == 0
                or width > ENDPOINT_MARKER_MAX_DIMENSION
                or height > ENDPOINT_MARKER_MAX_DIMENSION
            ):
                raise ValueError(
                    f"endpoint_marker_custom_dataurl PNG dimensions {width}x{height} "
                    f"are out of range (max {ENDPOINT_MARKER_MAX_DIMENSION})"
                )
        return dataurl

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
