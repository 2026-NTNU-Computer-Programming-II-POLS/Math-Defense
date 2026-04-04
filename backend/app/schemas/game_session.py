from datetime import datetime
from pydantic import BaseModel, field_validator


class SessionCreate(BaseModel):
    level: int

    @field_validator("level")
    @classmethod
    def check_level(cls, v: int) -> int:
        if v < 1 or v > 4:
            raise ValueError("關卡需在 1~4 之間")
        return v


class SessionUpdate(BaseModel):
    current_wave: int | None = None
    gold: int | None = None
    hp: int | None = None
    score: int | None = None


class SessionEnd(BaseModel):
    score: int
    kills: int
    waves_survived: int


class SessionOut(BaseModel):
    id: str
    level: int
    status: str
    current_wave: int
    gold: int
    hp: int
    score: int
    started_at: datetime
    ended_at: datetime | None = None

    class Config:
        from_attributes = True
