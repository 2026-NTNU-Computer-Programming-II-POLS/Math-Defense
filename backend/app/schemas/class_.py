import re
from datetime import datetime
from pydantic import BaseModel, ConfigDict, field_validator


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
        v = v.strip().lower()
        if not v:
            raise ValueError("Email is required")
        if not re.match(r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$', v):
            raise ValueError("Invalid email format")
        return v


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
