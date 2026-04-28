from datetime import datetime
from pydantic import BaseModel, ConfigDict


class UserSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    email: str
    player_name: str
    role: str
    created_at: datetime | None = None


class ClassSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    name: str
    teacher_id: str
    join_code: str
    created_at: datetime
