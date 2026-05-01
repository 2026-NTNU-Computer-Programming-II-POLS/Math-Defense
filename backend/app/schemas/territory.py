import json
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


_PATH_CONFIG_MAX_BYTES = 10_240


class SlotDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    star_rating: int = Field(ge=1, le=5)
    path_config: dict[str, Any] | None = None

    @field_validator("path_config")
    @classmethod
    def path_config_size(cls, v: dict[str, Any] | None) -> dict[str, Any] | None:
        if v is not None and len(json.dumps(v)) > _PATH_CONFIG_MAX_BYTES:
            raise ValueError(f"path_config exceeds {_PATH_CONFIG_MAX_BYTES} byte limit")
        return v


class CreateActivityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    deadline: datetime
    class_id: str | None = None
    slots: list[SlotDefinition] = Field(min_length=1, max_length=50)

    @field_validator("title")
    @classmethod
    def title_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 1 or len(v) > 200:
            raise ValueError("Title must be 1-200 characters")
        return v


class PlayTerritoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1, max_length=100)


class OccupationOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    slot_id: str
    student_id: str
    score: float
    occupied_at: datetime
    player_name: str | None = None


class SlotOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    activity_id: str
    star_rating: int
    slot_index: int
    path_config: dict[str, Any] | None = None
    occupation: OccupationOut | None = None


class ActivityOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    class_id: str | None
    teacher_id: str
    title: str
    deadline: datetime
    settled: bool
    created_at: datetime


class ActivityDetailOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    activity: ActivityOut
    slots: list[SlotOut]


class PlayResultOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    seized: bool
    occupation: OccupationOut


class RankingEntryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rank: int
    student_id: str
    territory_value: float


class ExternalRankingEntryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rank: int
    class_id: str
    avg_territory_value: float
