from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.user.constraints import PLAYER_NAME_MAX_LENGTH, PLAYER_NAME_MIN_LENGTH
from app.domain.user.value_objects import Email
from app.schemas.auth import _validate_password_shape


class UserSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    email: str
    player_name: str
    role: str
    is_active: bool = True
    created_at: datetime | None = None
    classes_joined_count: int = 0


class SetUserActiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_active: bool


class CreateTeacherRequest(BaseModel):
    """Admin-only teacher account creation.

    Mirrors RegisterRequest but bypasses M-04's student-only gate because the
    caller is an authenticated admin. The created account is marked
    email-verified — the admin vouches for the identity, and the new teacher
    cannot complete the verification flow themselves before first login.
    """
    model_config = ConfigDict(extra="forbid")

    email: str
    password: str
    player_name: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
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


class ClassSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    teacher_id: str
    join_code: str
    created_at: datetime
    student_count: int = 0


class PaginatedUsersOut(BaseModel):
    items: list[UserSummaryOut]
    total: int


class PaginatedClassesOut(BaseModel):
    items: list[ClassSummaryOut]
    total: int
