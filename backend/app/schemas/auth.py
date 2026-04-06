import re
from pydantic import BaseModel, field_validator


class RegisterRequest(BaseModel):
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        if len(v) < 3 or len(v) > 50:
            raise ValueError("用戶名長度需在 3~50 字之間")
        if not re.match(r'^[a-zA-Z0-9_-]+$', v):
            raise ValueError("用戶名只能包含英文字母、數字、底線和連字號")
        return v

    @field_validator("password")
    @classmethod
    def password_valid(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("密碼至少需要 8 個字元")
        if len(v) > 128:
            raise ValueError("密碼過長")
        if not re.search(r'[a-zA-Z]', v):
            raise ValueError("密碼需包含至少一個英文字母")
        if not re.search(r'[0-9]', v):
            raise ValueError("密碼需包含至少一個數字")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
