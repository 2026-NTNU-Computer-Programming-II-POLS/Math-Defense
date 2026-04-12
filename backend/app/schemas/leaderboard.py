from datetime import datetime
from pydantic import BaseModel, field_validator


class ScoreSubmission(BaseModel):
    level: int  # validated: 1-4
    score: int  # validated: 0-9999999
    kills: int  # validated: 0-9999
    waves_survived: int  # validated: 0-999
    session_id: str  # a valid session_id must be provided to prevent score forgery

    @field_validator("level")
    @classmethod
    def check_level(cls, v: int) -> int:
        if v < 1 or v > 4:
            raise ValueError("Level must be between 1 and 4")
        return v

    @field_validator("score")
    @classmethod
    def check_score(cls, v: int) -> int:
        if v < 0 or v > 9999999:
            raise ValueError("Score must be between 0 and 9999999")
        return v

    @field_validator("kills")
    @classmethod
    def check_kills(cls, v: int) -> int:
        # Upper bound stops clients from parking 9_999_999_999 on the leaderboard.
        if v < 0 or v > 9999:
            raise ValueError("kills must be between 0 and 9999")
        return v

    @field_validator("waves_survived")
    @classmethod
    def check_waves_survived(cls, v: int) -> int:
        if v < 0 or v > 999:
            raise ValueError("waves_survived must be between 0 and 999")
        return v


class LeaderboardEntryOut(BaseModel):
    rank: int
    username: str
    level: int
    score: int
    kills: int
    waves_survived: int
    created_at: datetime


class LeaderboardResponse(BaseModel):
    entries: list[LeaderboardEntryOut]
    total: int
