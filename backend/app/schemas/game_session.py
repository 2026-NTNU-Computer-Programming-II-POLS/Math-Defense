from datetime import datetime
from pydantic import BaseModel, Field, model_validator

from app.domain.constraints import (
    GOLD_MAX,
    GOLD_MIN,
    HP_MAX,
    HP_MIN,
    KILLS_MAX,
    KILLS_MIN,
    LEVEL_MAX,
    LEVEL_MIN,
    SCORE_MAX,
    SCORE_MIN,
    WAVES_MAX,
    WAVES_MIN,
)


class SessionCreate(BaseModel):
    level: int = Field(ge=LEVEL_MIN, le=LEVEL_MAX)


class SessionUpdate(BaseModel):
    current_wave: int | None = Field(default=None, ge=WAVES_MIN, le=WAVES_MAX)
    gold: int | None = Field(default=None, ge=GOLD_MIN, le=GOLD_MAX)
    hp: int | None = Field(default=None, ge=HP_MIN, le=HP_MAX)
    score: int | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "SessionUpdate":
        fields = ("current_wave", "gold", "hp", "score")
        if all(getattr(self, f) is None for f in fields):
            raise ValueError(
                "Provide at least one of: current_wave, gold, hp, score"
            )
        return self


class SessionEnd(BaseModel):
    score: int = Field(ge=SCORE_MIN, le=SCORE_MAX)
    kills: int = Field(ge=KILLS_MIN, le=KILLS_MAX)
    waves_survived: int = Field(ge=WAVES_MIN, le=WAVES_MAX)


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
