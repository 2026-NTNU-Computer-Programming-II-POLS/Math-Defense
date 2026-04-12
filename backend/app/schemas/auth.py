import re
from datetime import datetime
from pydantic import BaseModel, field_validator


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 50:
            raise ValueError("Username must be 3 to 50 characters long")
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("Username may only contain letters, digits, underscore, and hyphen")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if len(v) > 128:
            raise ValueError("Password is too long")
        if not re.search(r'[a-zA-Z]', v):
            raise ValueError("Password must contain at least one letter")
        if not re.search(r'[0-9]', v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class AuthMeResponse(BaseModel):
    id: str
    username: str
    created_at: datetime
