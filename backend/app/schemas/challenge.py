"""Pydantic DTOs for the Challenge router (spec §23)."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.domain.challenge.constraint_dsl import (
    MAGIC_DEFAULT_BOUNDS,
    TARGET_SCORE_MAX,
    TARGET_SCORE_MIN,
    WAVE_COUNT_MAX,
    WAVE_COUNT_MIN,
)
from app.domain.challenge.tower_types import (
    ALLOWED_FORBIDDEN_MECHANICS,
    TowerType,
)


class MagicParamBoundsIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    a: tuple[float, float] | None = None
    b: tuple[float, float] | None = None
    c: tuple[float, float] | None = None

    @field_validator("a", "b", "c")
    @classmethod
    def _ordered(cls, v: tuple[float, float] | None) -> tuple[float, float] | None:
        if v is None:
            return None
        lo, hi = v
        if lo > hi:
            raise ValueError("magic_param_bounds: lo must be <= hi")
        return v


class ChallengeConstraintsIn(BaseModel):
    """Request body shape — mirrors `ChallengeConstraints` (domain VO).

    Schema-level validation here is defence-in-depth; the domain VO re-validates
    on construction so non-HTTP callers reach the same invariants.
    """

    model_config = ConfigDict(extra="forbid")

    allowed_towers: list[TowerType] = Field(min_length=1, max_length=7)
    magic_param_bounds: MagicParamBoundsIn = Field(
        default_factory=MagicParamBoundsIn
    )
    forbidden_mechanics: list[Annotated[str, Field(max_length=64)]] = Field(default_factory=list, max_length=10)
    wave_count: int = Field(ge=WAVE_COUNT_MIN, le=WAVE_COUNT_MAX)
    target_score: int = Field(ge=TARGET_SCORE_MIN, le=TARGET_SCORE_MAX)

    @field_validator("forbidden_mechanics")
    @classmethod
    def _whitelist(cls, v: list[str]) -> list[str]:
        unknown = set(v) - ALLOWED_FORBIDDEN_MECHANICS
        if unknown:
            raise ValueError(
                f"forbidden_mechanics: unknown values {sorted(unknown)}; "
                f"allowed: {sorted(ALLOWED_FORBIDDEN_MECHANICS)}"
            )
        return v


class ChallengeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    constraints: ChallengeConstraintsIn


class ChallengeRename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class ChallengeConstraintsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    constraints: ChallengeConstraintsIn


class ChallengeOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str
    teacher_id: str
    title: str
    description: str
    constraints: dict
    created_at: datetime
    updated_at: datetime
    deep_link: str
    # Reference data so the frontend builder can render fallback ranges
    # without re-importing the constants module.
    magic_default_bounds: dict[str, list[float]] = Field(
        default_factory=lambda: {
            k: [v[0], v[1]] for k, v in MAGIC_DEFAULT_BOUNDS.items()
        }
    )
