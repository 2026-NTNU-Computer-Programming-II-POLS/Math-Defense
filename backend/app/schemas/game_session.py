from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.domain.constraints import (
    GOLD_MAX,
    GOLD_MIN,
    HP_MAX,
    HP_MIN,
    KILLS_MAX,
    KILLS_MIN,
    SCORE_MAX,
    SCORE_MIN,
    STAR_MAX,
    STAR_MIN,
    WAVES_MAX,
    WAVES_MIN,
)


class SessionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    star_rating: int = Field(ge=STAR_MIN, le=STAR_MAX)
    path_config: dict | None = None
    initial_answer: bool = False


class SessionUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    current_wave: int | None = Field(default=None, ge=WAVES_MIN, le=WAVES_MAX)
    gold: int | None = Field(default=None, ge=GOLD_MIN, le=GOLD_MAX)
    hp: int | None = Field(default=None, ge=HP_MIN, le=HP_MAX)
    score: int | None = Field(default=None, ge=SCORE_MIN, le=SCORE_MAX)
    kill_value: int | None = Field(default=None, ge=0, le=SCORE_MAX)
    cost_total: int | None = Field(default=None, ge=0, le=GOLD_MAX)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "SessionUpdate":
        fields = ("current_wave", "gold", "hp", "score", "kill_value", "cost_total")
        if all(getattr(self, f) is None for f in fields):
            raise ValueError(
                "Provide at least one of: current_wave, gold, hp, score, kill_value, cost_total"
            )
        return self


class SessionEnd(BaseModel):
    model_config = ConfigDict(extra="forbid")

    score: int = Field(ge=SCORE_MIN, le=SCORE_MAX)
    kills: int = Field(ge=KILLS_MIN, le=KILLS_MAX)
    waves_survived: int = Field(ge=WAVES_MIN, le=WAVES_MAX)

    # V2 scoring variables (optional for backward compat)
    kill_value: int | None = Field(default=None, ge=0, le=SCORE_MAX)
    cost_total: int | None = Field(default=None, ge=0, le=GOLD_MAX)
    time_total: float | None = Field(default=None, ge=0, le=7200.0)
    health_origin: int | None = Field(default=None, ge=HP_MIN, le=HP_MAX)
    health_final: int | None = Field(default=None, ge=HP_MIN, le=HP_MAX)
    time_exclude_prepare: list[float] | None = Field(default=None, max_length=50)
    n_prep_phases: int | None = Field(default=None, ge=0, le=50)
    total_score: float | None = Field(default=None, ge=0)


SESSION_OUT_SCHEMA_VERSION = 1


class UnlockedAchievementOut(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    talent_points: int


class SessionOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    schema_version: int = SESSION_OUT_SCHEMA_VERSION
    id: str
    star_rating: int
    status: str
    current_wave: int
    gold: int
    hp: int
    score: int
    started_at: datetime
    ended_at: datetime | None = None
    newly_unlocked_achievements: list[UnlockedAchievementOut] = []
