from datetime import datetime
from pydantic import BaseModel, field_validator


class ScoreSubmission(BaseModel):
    level: int  # validated: 1-4
    score: int  # validated: >= 0
    kills: int  # validated: >= 0
    waves_survived: int  # validated: >= 0
    session_id: str | None = None

    @field_validator("level")
    @classmethod
    def check_level(cls, v: int) -> int:
        if v < 1 or v > 4:
            raise ValueError("關卡需在 1~4 之間")
        return v

    @field_validator("score")
    @classmethod
    def check_score(cls, v: int) -> int:
        if v < 0 or v > 9999999:
            raise ValueError("分數需在 0~9999999 之間")
        return v

    @field_validator("kills", "waves_survived")
    @classmethod
    def check_non_negative(cls, v: int) -> int:
        if v < 0:
            raise ValueError("數值不可為負")
        return v


class LeaderboardEntryOut(BaseModel):
    rank: int
    username: str
    level: int
    score: int
    kills: int
    waves_survived: int
    created_at: datetime

    class Config:
        from_attributes = True


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntryOut]
    total: int
