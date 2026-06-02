import re
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.user.constraints import (
    ALLOWED_ENDPOINT_HIT_FX_STYLES,
    ALLOWED_ENDPOINT_MARKER_STYLES,
    ENDPOINT_MARKER_DATAURL_MAX_LENGTH,
    ENDPOINT_MARKER_DATAURL_PREFIXES,
    PLAYER_NAME_MIN_LENGTH,
    PLAYER_NAME_MAX_LENGTH,
    PROFILE_INITIALS_COLOR_PATTERN,
    PROFILE_INITIALS_MAX_LETTERS,
)
from app.domain.user.value_objects import Email
from app.utils.security import BCRYPT_MAX_BYTES


def _validate_password_shape(v: str) -> str:
    """Cheap structural checks that run inside Pydantic validation.

    The expensive zxcvbn dictionary check has been moved to the application
    service (B-ARCH-18) so it executes after the per-route rate limiter
    rather than burning CPU on every unauthenticated POST body.
    """
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
        raise ValueError("Password is too long")
    if not re.search(r'[a-zA-Z]', v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r'[0-9]', v):
        raise ValueError("Password must contain at least one digit")
    return v


class RegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str
    player_name: str
    role: str = "student"

    @field_validator("role")
    @classmethod
    def role_valid(cls, v: str) -> str:
        # M-04: self-service registration only permits student accounts.
        if v != "student":
            raise ValueError("Self-service registration is limited to the 'student' role")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        # Single source of truth: the Email VO does normalisation + format /
        # length validation. Pydantic only surfaces the resulting message.
        return Email(v).value

    @field_validator("player_name")
    @classmethod
    def player_name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < PLAYER_NAME_MIN_LENGTH or len(v) > PLAYER_NAME_MAX_LENGTH:
            raise ValueError(f"Player name must be {PLAYER_NAME_MIN_LENGTH}-{PLAYER_NAME_MAX_LENGTH} characters")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        return _validate_password_shape(v)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_max_length(cls, v: str) -> str:
        return Email(v).value

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError("Password is too long")
        return v


class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    token_type: str = "bearer"
    # Identity fields are absent on an MFA-challenge response — the caller is
    # not authenticated yet and only mfa_required/mfa_token are meaningful.
    # They are populated once login (or the MFA challenge) completes.
    id: str | None = None
    email: str | None = None
    player_name: str | None = None
    role: str | None = None
    is_email_verified: bool = False
    mfa_required: bool = False
    mfa_token: str | None = None


class RegisterAcceptedResponse(BaseModel):
    """Generic 202 response for /register.

    Carries no user fields so the response is byte-identical regardless of
    whether the email was previously registered (M-05 anti-enumeration).
    """
    model_config = ConfigDict(extra="forbid")

    detail: str = "If the email is available, an account was created. Check your inbox to verify the address before signing in."


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str

    @field_validator("current_password")
    @classmethod
    def current_password_max_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError("Password is too long")
        return v

    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_valid(cls, v: str) -> str:
        return _validate_password_shape(v)


class AuthMeResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    email: str
    player_name: str
    role: str
    created_at: datetime
    is_email_verified: bool = False
    mfa_enabled: bool = False
    # Star-5 personal unlock derived from completed-IA history; the level-select
    # screen reads this to disable the Star-5 button until the user clears IA.
    ia_unlock_earned: bool = False
    # Rolling fraction (0.0–1.0) of the last 10 completed sessions whose IA
    # was answered correctly. The frontend curve renderer reads this at
    # level start to fade y-axis labels (spec §17).
    ia_recent_accuracy: float = 0.0
    # Endpoint marker (P*) preferences persisted server-side so the player's
    # choice follows them across devices. Frontend uses these to hydrate
    # uiStore on login; None means use the FE local default.
    endpoint_marker_style: str | None = None
    endpoint_marker_custom_dataurl: str | None = None
    endpoint_hit_fx: str | None = None
    # Profile-initials avatar (letters + colour). Both nullable, but always
    # set or cleared together — the aggregate rejects half-filled state.
    profile_initials_letters: str | None = None
    profile_initials_color: str | None = None


class UpdatePlayerNameRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    player_name: str

    @field_validator("player_name")
    @classmethod
    def player_name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < PLAYER_NAME_MIN_LENGTH or len(v) > PLAYER_NAME_MAX_LENGTH:
            raise ValueError(f"Player name must be {PLAYER_NAME_MIN_LENGTH}-{PLAYER_NAME_MAX_LENGTH} characters")
        return v


class EndpointMarkerUpdateRequest(BaseModel):
    """PUT /api/auth/profile/endpoint-marker body.

    All three fields are independently nullable; passing `None` clears the
    corresponding stored value. This schema does fast-path validation so
    the route returns 422 before the aggregate runs; the aggregate then
    re-checks the same invariants as the canonical source of truth
    (domain.user.aggregate.User.update_endpoint_marker).
    """
    model_config = ConfigDict(extra="forbid")

    style: str | None
    custom_dataurl: str | None
    hit_fx: str | None

    @field_validator("style")
    @classmethod
    def style_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_ENDPOINT_MARKER_STYLES:
            raise ValueError(
                "Invalid endpoint marker style — must be one of "
                f"{sorted(ALLOWED_ENDPOINT_MARKER_STYLES)}"
            )
        return v

    @field_validator("hit_fx")
    @classmethod
    def hit_fx_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in ALLOWED_ENDPOINT_HIT_FX_STYLES:
            raise ValueError(
                "Invalid endpoint hit FX — must be one of "
                f"{sorted(ALLOWED_ENDPOINT_HIT_FX_STYLES)}"
            )
        return v

    @field_validator("custom_dataurl")
    @classmethod
    def custom_dataurl_shape(cls, v: str | None) -> str | None:
        # Only checks shape (prefix + length) at the Pydantic layer to keep
        # 422s fast. Magic-byte validation lives in the aggregate so a single
        # source of truth governs what bytes are accepted.
        if v is None:
            return v
        if len(v) > ENDPOINT_MARKER_DATAURL_MAX_LENGTH:
            raise ValueError(
                f"custom_dataurl exceeds {ENDPOINT_MARKER_DATAURL_MAX_LENGTH} bytes"
            )
        if not any(v.startswith(p) for p in ENDPOINT_MARKER_DATAURL_PREFIXES):
            raise ValueError(
                "custom_dataurl must start with one of: "
                + ", ".join(ENDPOINT_MARKER_DATAURL_PREFIXES)
            )
        return v


class ProfileInitialsUpdateRequest(BaseModel):
    """PUT /api/auth/profile/initials body.

    Both fields move together: pass both to set the avatar, both as None to
    clear. Fast-path validation here returns 422 before the aggregate runs;
    the aggregate then re-checks as the canonical source of truth.
    """
    model_config = ConfigDict(extra="forbid")

    letters: str | None
    color: str | None

    @field_validator("letters")
    @classmethod
    def letters_length(cls, v: str | None) -> str | None:
        if v is None:
            return v
        cleaned = v.strip()
        if len(cleaned) < 1 or len(cleaned) > PROFILE_INITIALS_MAX_LETTERS:
            raise ValueError(
                f"letters must be 1-{PROFILE_INITIALS_MAX_LETTERS} characters"
            )
        return cleaned

    @field_validator("color")
    @classmethod
    def color_shape(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not re.match(PROFILE_INITIALS_COLOR_PATTERN, v):
            raise ValueError("color must be a 7-character hex string (e.g. '#a1b2c3')")
        return v


class MFASetupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str

    @field_validator("current_password")
    @classmethod
    def current_password_max_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError("Password is too long")
        return v


class MFASetupResponse(BaseModel):
    provisioning_uri: str


class MFAConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str
    code: str

    @field_validator("current_password")
    @classmethod
    def current_password_max_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError("Password is too long")
        return v

    @field_validator("code")
    @classmethod
    def code_digits(cls, v: str) -> str:
        if not re.match(r'^\d{6}$', v):
            raise ValueError("TOTP code must be exactly 6 digits")
        return v


class MFAChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mfa_token: str = Field(min_length=20, max_length=2048)
    code: str

    @field_validator("code")
    @classmethod
    def code_digits(cls, v: str) -> str:
        if not re.match(r'^\d{6}$', v):
            raise ValueError("TOTP code must be exactly 6 digits")
        return v


class DisableMFARequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_password: str
    # Step-up: a fresh TOTP from the authenticator app is required even
    # though the access cookie has already cleared MFA on this login. See
    # AuthApplicationService.disable_mfa for the rationale.
    code: str

    @field_validator("current_password")
    @classmethod
    def current_password_max_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > BCRYPT_MAX_BYTES:
            raise ValueError("Password is too long")
        return v

    @field_validator("code")
    @classmethod
    def code_digits(cls, v: str) -> str:
        if not re.match(r'^\d{6}$', v):
            raise ValueError("TOTP code must be exactly 6 digits")
        return v
