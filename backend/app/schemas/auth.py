import re
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.user.constraints import PLAYER_NAME_MIN_LENGTH, PLAYER_NAME_MAX_LENGTH
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
    id: str
    email: str
    player_name: str
    role: str
    avatar_url: str | None = None
    is_email_verified: bool = False
    mfa_required: bool = False
    mfa_token: str | None = None


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
    avatar_url: str | None = None
    is_email_verified: bool = False
    mfa_enabled: bool = False
    # Star-5 personal unlock derived from completed-IA history; the level-select
    # screen reads this to disable the Star-5 button until the user clears IA.
    ia_unlock_earned: bool = False
    # Rolling fraction (0.0–1.0) of the last 10 completed sessions whose IA
    # was answered correctly. The frontend curve renderer reads this at
    # level start to fade y-axis labels (spec §17).
    ia_recent_accuracy: float = 0.0


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


_ALLOWED_AVATAR_URLS = frozenset({
    '/avatars/wizard.svg',
    '/avatars/knight.svg',
    '/avatars/archer.svg',
    '/avatars/mage.svg',
    '/avatars/scholar.svg',
    '/avatars/alchemist.svg',
})


class AvatarUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    avatar_url: str | None

    @field_validator("avatar_url")
    @classmethod
    def avatar_url_valid(cls, v: str | None) -> str | None:
        if v is not None and v not in _ALLOWED_AVATAR_URLS:
            raise ValueError("Invalid avatar URL")
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
