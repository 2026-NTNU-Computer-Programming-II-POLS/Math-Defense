from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.user.value_objects import Email


# Surface-level safety net only — business validation lives in the Class
# aggregate (_validate_name). Pydantic keeps the request payload bounded.
_MAX_NAME = 100
_MAX_DESC = 500


class CreateClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=_MAX_NAME)
    description: str | None = Field(default=None, max_length=_MAX_DESC)
    subject: str | None = Field(default=None, max_length=80)
    school_year: str | None = Field(default=None, max_length=40)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    color: str | None = Field(default=None, max_length=16)
    icon: str | None = Field(default=None, max_length=40)


class ClassOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    teacher_id: str
    join_code: str
    created_at: datetime
    description: str | None = None
    subject: str | None = None
    school_year: str | None = None
    capacity: int | None = None
    color: str | None = None
    icon: str | None = None
    archived_at: datetime | None = None


class ClassOutStudent(BaseModel):
    """Class info visible to students (no join_code)."""
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    teacher_id: str
    teacher_player_name: str | None = None
    created_at: datetime
    description: str | None = None
    subject: str | None = None
    school_year: str | None = None
    color: str | None = None
    icon: str | None = None
    archived_at: datetime | None = None


class UpdateClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=_MAX_NAME)
    description: str | None = Field(default=None, max_length=_MAX_DESC)
    subject: str | None = Field(default=None, max_length=80)
    school_year: str | None = Field(default=None, max_length=40)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    color: str | None = Field(default=None, max_length=16)
    icon: str | None = Field(default=None, max_length=40)


class AddStudentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        return Email(v).value


class BulkAddStudentsRequest(BaseModel):
    """Add many students by email in one call.

    Unregistered emails become pending invites — they auto-attach when the
    user registers with the matching address.
    """
    model_config = ConfigDict(extra="forbid")

    emails: list[str] = Field(min_length=1, max_length=200)

    @field_validator("emails")
    @classmethod
    def emails_valid(cls, v: list[str]) -> list[str]:
        # Normalise + dedupe while preserving order. Invalid entries raise
        # early so the caller gets a clear 422 rather than a per-row error.
        seen: set[str] = set()
        out: list[str] = []
        for raw in v:
            email = Email(raw).value
            if email in seen:
                continue
            seen.add(email)
            out.append(email)
        return out


class TransferOwnershipRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_teacher_id: str = Field(min_length=1, max_length=64)


class JoinClassRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str

    @field_validator("code")
    @classmethod
    def code_valid(cls, v: str) -> str:
        # join codes are stored upper-case alphanumeric, 8 characters
        # (see Class.create / ck_classes_join_code_upper).
        v = v.strip().upper()
        if len(v) != 8:
            raise ValueError("Join code must be 8 characters")
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
    total_score: float | None = None
    reflection_text: str
    ended_at: datetime | None = None


# ── Co-teacher ────────────────────────────────────────────────────────────────


class CoTeacherOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    class_id: str
    teacher_id: str
    player_name: str = ""
    email: str = ""
    added_at: datetime


class AddCoTeacherRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: str

    @field_validator("email")
    @classmethod
    def email_valid(cls, v: str) -> str:
        return Email(v).value


# ── Pending invite ────────────────────────────────────────────────────────────


class PendingInviteOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    class_id: str
    email: str
    invited_at: datetime


class BulkAddStudentsResult(BaseModel):
    """Outcome of a bulk add: which emails were attached vs invited."""
    model_config = ConfigDict(extra="ignore")

    added: list[MembershipOut]
    invited: list[PendingInviteOut]
    skipped: list[dict]  # [{email, reason}]


# ── Groups ────────────────────────────────────────────────────────────────────


class ClassGroupOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    class_id: str
    name: str
    color: str | None = None
    created_at: datetime
    member_count: int = 0


class CreateGroupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=16)


class UpdateGroupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=80)
    color: str | None = Field(default=None, max_length=16)


class GroupMemberOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    group_id: str
    student_id: str
    player_name: str = ""
    email: str = ""


# ── Student transfer ──────────────────────────────────────────────────────────


class MoveStudentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_class_id: str = Field(min_length=1, max_length=64)


# ── Leaderboard / report ──────────────────────────────────────────────────────


class ClassLeaderboardEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")

    student_id: str
    player_name: str = ""
    sessions_played: int
    average_stars: float
    total_score: int
    last_played_at: datetime | None = None


class ClassReportRow(BaseModel):
    model_config = ConfigDict(extra="ignore")

    student_id: str
    player_name: str
    email: str
    joined_at: datetime
    sessions_played: int
    average_stars: float
    total_score: int
    last_played_at: datetime | None = None
    reflections_count: int


# ── QR / join URL ─────────────────────────────────────────────────────────────


class JoinQrOut(BaseModel):
    """Payload the frontend renders into a QR code (the QR encoder lives on
    the frontend to avoid an extra Python dependency)."""
    model_config = ConfigDict(extra="ignore")

    code: str
    join_url: str
