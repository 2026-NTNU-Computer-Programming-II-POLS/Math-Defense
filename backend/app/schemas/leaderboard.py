from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.domain.constraints import (
    KILLS_MAX,
    KILLS_MIN,
    WAVES_MAX,
    WAVES_MIN,
)


class ScoreSubmission(BaseModel):
    # level and score are intentionally absent — the backend reads them from
    # the authoritative GameSession record to prevent score/level forgery.
    kills: int = Field(ge=KILLS_MIN, le=KILLS_MAX)
    waves_survived: int = Field(ge=WAVES_MIN, le=WAVES_MAX)
    session_id: UUID


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
