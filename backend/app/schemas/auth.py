import re
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.user.constraints import EMAIL_MAX_LENGTH, PLAYER_NAME_MIN_LENGTH, PLAYER_NAME_MAX_LENGTH


import zxcvbn

def _validate_password_strength(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Password must be at least 8 characters")
    if len(v.encode("utf-8")) > 72:
        raise ValueError("Password is too long")
    if not re.search(r'[a-zA-Z]', v):
        raise ValueError("Password must contain at least one letter")
    if not re.search(r'[0-9]', v):
        raise ValueError("Password must contain at least one digit")

    result = zxcvbn.zxcvbn(v)
    if result['score'] < 2:
        feedback = result['feedback']['warning'] or "Password is too weak or common."
        raise ValueError(f"Password is too weak: {feedback}")

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
        if v not in ("student", "teacher"):
            raise ValueError("Role must be 'student' or 'teacher'")
        return v

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        v = v.strip().lower()
        if not v or len(v) > EMAIL_MAX_LENGTH:
            raise ValueError(f"Email must be 1-{EMAIL_MAX_LENGTH} characters")
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError("Invalid email format")
        return v

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
        return _validate_password_strength(v)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str

    @field_validator("email")
    @classmethod
    def email_max_length(cls, v: str) -> str:
        if len(v) > 255:
            raise ValueError("Email must not exceed 255 characters")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def validate_password_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
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
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        return v

    new_password: str

    @field_validator("new_password")
    @classmethod
    def new_password_valid(cls, v: str) -> str:
        return _validate_password_strength(v)


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


class MFASetupResponse(BaseModel):
    provisioning_uri: str


class MFAConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str

    @field_validator("code")
    @classmethod
    def code_digits(cls, v: str) -> str:
        if not re.match(r'^\d{6}$', v):
            raise ValueError("TOTP code must be exactly 6 digits")
        return v


class MFAChallengeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mfa_token: str
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

    @field_validator("current_password")
    @classmethod
    def current_password_max_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        return v
