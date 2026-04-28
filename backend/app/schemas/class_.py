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
    created_at: datetime


class AddStudentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    student_id: str


class JoinClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str

    @field_validator("code")
    @classmethod
    def code_valid(cls, v: str) -> str:
        v = v.strip().upper()
        if len(v) != 6:
            raise ValueError("Join code must be exactly 6 characters")
        if not v.isalnum():
            raise ValueError("Join code must be alphanumeric")
        return v


class MembershipOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    class_id: str
    student_id: str
    joined_at: datetime
