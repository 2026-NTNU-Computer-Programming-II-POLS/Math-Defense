from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SeasonCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    season_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    starts_at: datetime
    ends_at: datetime


class SeasonOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    season_id: str
    name: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    active: bool = False
    archived: bool = False
    achievement_ids: list[str] = []
