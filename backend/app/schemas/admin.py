from datetime import datetime
from pydantic import BaseModel, ConfigDict


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
    is_active: bool


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
