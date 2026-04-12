from datetime import datetime
from pydantic import BaseModel, Field

from app.domain.constraints import (
    KILLS_MAX,
    KILLS_MIN,
    LEVEL_MAX,
    LEVEL_MIN,
    SCORE_MAX,
    SCORE_MIN,
    WAVES_MAX,
    WAVES_MIN,
)


class ScoreSubmission(BaseModel):
    level: int = Field(ge=LEVEL_MIN, le=LEVEL_MAX)
    score: int = Field(ge=SCORE_MIN, le=SCORE_MAX)
    kills: int = Field(ge=KILLS_MIN, le=KILLS_MAX)
    waves_survived: int = Field(ge=WAVES_MIN, le=WAVES_MAX)
    # A valid session_id must be provided to prevent score forgery.
    session_id: str


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
