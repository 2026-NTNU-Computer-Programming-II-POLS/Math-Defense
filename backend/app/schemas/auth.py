import re
from datetime import datetime
from pydantic import BaseModel, field_validator


# Low-effort passwords that pass the length/letter/digit check but are trivially
# brute-forced. The list is small on purpose: a curated top-N beats a multi-MB
# wordlist that still lets `Summer2026` through. Compared case-insensitively.
_COMMON_PASSWORDS = frozenset({
    "password1", "password12", "password123", "passw0rd", "p@ssw0rd",
    "qwerty123", "qwerty1234", "abc12345", "abcd1234", "123456789", "1234567890",
    "letmein1", "letmein123", "welcome1", "welcome123", "iloveyou1", "iloveyou123",
    "admin123", "admin1234", "master123", "monkey123", "dragon123",
    "football1", "baseball1", "superman1", "sunshine1", "princess1",
    "test1234", "hello123", "changeme1", "trustno1", "starwars1",
})


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
        # bcrypt silently truncates at 72 *bytes*; check encoded length so
        # multi-byte Unicode passwords don't slip past the limit.
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        if not re.search(r'[a-zA-Z]', v):
            raise ValueError("Password must contain at least one letter")
        if not re.search(r'[0-9]', v):
            raise ValueError("Password must contain at least one digit")
        # Reject five-or-more-in-a-row repeats (e.g. `aaaaaaaa1`, `11111abc`).
        if re.search(r'(.)\1{4,}', v):
            raise ValueError("Password must not contain five or more of the same character in a row")
        if v.lower() in _COMMON_PASSWORDS:
            raise ValueError("Password is too common; choose something less guessable")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_max_length(cls, v: str) -> str:
        if len(v) > 50:
            raise ValueError("Username must not exceed 50 characters")
        return v

    @field_validator("password")
    @classmethod
    def password_max_length(cls, v: str) -> str:
        # bcrypt silently truncates at 72 *bytes*; check encoded length so
        # multi-byte Unicode passwords don't cause CPU-bound DoS.
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password is too long")
        return v


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    id: str
    username: str


class AuthMeResponse(BaseModel):
    id: str
    username: str
    created_at: datetime
