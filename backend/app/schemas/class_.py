from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator

from app.domain.user.value_objects import Email


class CreateClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str

    @field_validator("name")
    @classmethod
    def name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 100:
            raise ValueError("Class name must be 1-100 characters")
        return v


class ClassOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    teacher_id: str
    join_code: str
    created_at: datetime


class ClassOutStudent(BaseModel):
    """Class info visible to students (no join_code)."""
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    teacher_id: str
    teacher_player_name: str | None = None
    created_at: datetime


class UpdateClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str

    @field_validator("name")
    @classmethod
    def name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 100:
            raise ValueError("Class name must be 1-100 characters")
        return v


class AddStudentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        return Email(v).value


class JoinClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str

    @field_validator("code")
    @classmethod
    def code_valid(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) not in (6, 8):
            raise ValueError("Join code must be 6 or 8 characters")
        if not v.isalnum():
            raise ValueError("Join code must be alphanumeric")
        return v


class MembershipOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    class_id: str
    student_id: str
    joined_at: datetime
    player_name: str = ""
    email: str = ""


class ClassReflectionOut(BaseModel):
    """A student's reflection surfaced to the class owner (teacher)."""
    model_config = ConfigDict(extra="ignore")

    session_id: str
    student_id: str
    student_name: str = ""
    star_rating: int
    score: int
    reflection_text: str
    ended_at: datetime | None = None
