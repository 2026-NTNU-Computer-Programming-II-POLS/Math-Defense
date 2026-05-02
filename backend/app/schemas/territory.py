import json
import re
from datetime import datetime, timedelta, UTC
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

_MIN_DEADLINE_BUFFER = timedelta(minutes=5)
_PATH_CONFIG_MAX_BYTES = 10_240
_TITLE_INVALID_RE = re.compile(r'[\x00-\x1f\x7f​-‍  ﻿]')


class PathConfig(BaseModel):
    """Shape of a territory slot's path configuration.

    Extra fields are allowed so the game can extend this without API changes.
    """
    model_config = ConfigDict(extra="allow")


class SlotDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")

    star_rating: int = Field(ge=1, le=5)
    path_config: PathConfig | None = None

    @field_validator("path_config", mode="before")
    @classmethod
    def path_config_size(cls, v: Any) -> Any:
        if v is not None and isinstance(v, dict) and len(json.dumps(v)) > _PATH_CONFIG_MAX_BYTES:
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
        if _TITLE_INVALID_RE.search(v):
            raise ValueError("Title contains invalid characters")
        return v

    @field_validator("deadline")
    @classmethod
    def deadline_must_be_future(cls, v: datetime) -> datetime:
        # B-H-4: reject deadlines that are already past or imminent
        tz_v = v if v.tzinfo else v.replace(tzinfo=UTC)
        if tz_v <= datetime.now(UTC) + _MIN_DEADLINE_BUFFER:
            raise ValueError("Deadline must be at least 5 minutes in the future")
        return v


class PlayTerritoryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    session_id: str = Field(min_length=1, max_length=100)


class OccupationOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    slot_id: str
    student_id: str | None = None
    score: float
    occupied_at: datetime
    player_name: str | None = None
    is_own: bool = False


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
    settled_at: datetime | None = None
    settled_by: str | None = None
    created_at: datetime


class ActivityDetailOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    activity: ActivityOut
    slots: list[SlotOut]


class PlayResultOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    seized: bool
    occupation: OccupationOut | None = None


class RankingEntryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rank: int
    student_id: str
    player_name: str | None = None
    territory_value: float


class ExternalRankingEntryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    rank: int
    class_id: str
    class_name: str | None = None
    avg_territory_value: float
