from datetime import datetime
from pydantic import BaseModel, Field, field_validator, model_validator


class SessionCreate(BaseModel):
    level: int

    @field_validator("level")
    @classmethod
    def check_level(cls, v: int) -> int:
        if v < 1 or v > 4:
            raise ValueError("Level must be between 1 and 4")
        return v


class SessionUpdate(BaseModel):
    current_wave: int | None = Field(default=None, ge=0, le=999)
    gold: int | None = Field(default=None, ge=0, le=99999)
    hp: int | None = Field(default=None, ge=0, le=100)
    score: int | None = Field(default=None, ge=0, le=9999999)

    @model_validator(mode="after")
    def at_least_one_field(self) -> "SessionUpdate":
        fields = ("current_wave", "gold", "hp", "score")
        if all(getattr(self, f) is None for f in fields):
            raise ValueError(
                "Provide at least one of: current_wave, gold, hp, score"
            )
        return self


class SessionEnd(BaseModel):
    score: int = Field(ge=0, le=9999999)
    kills: int = Field(ge=0, le=9999)
    waves_survived: int = Field(ge=0, le=999)


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
