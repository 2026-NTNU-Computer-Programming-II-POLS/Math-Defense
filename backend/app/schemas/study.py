"""Pydantic DTOs for the Study router (Pedagogical_Backlog_Spec.md §27)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.domain.study import ITEMS_PER_FORM


class ProbeResponseItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_id: str = Field(min_length=1, max_length=32)
    selected: str = Field(min_length=1, max_length=8)


class ProbeSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    study_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    form: str = Field(pattern=r"^(pre|post|delay)$")
    responses: list[ProbeResponseItem] = Field(
        min_length=ITEMS_PER_FORM, max_length=ITEMS_PER_FORM,
    )


class ProbeSubmitResponse(BaseModel):
    score: int
    total: int = ITEMS_PER_FORM


class AffectSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    study_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    phase: str = Field(pattern=r"^(pre|post)$")
    # Likert ratings 1..5. Length is left flexible because the IMI subset
    # and the Ashcraft short-form may be tuned independently.
    anxiety_items: list[int] = Field(min_length=1, max_length=20)
    motivation_items: list[int] = Field(min_length=1, max_length=20)


class EnrollResponse(BaseModel):
    group: str  # "A" or "B"


class StudyExportRowOut(BaseModel):
    """Per-participant export row matching the §27.2 spec exactly."""

    user_id: str
    group: str
    pre_score: int | None
    post_score: int | None
    delay_score: int | None
    dosage_seconds: int
    anxiety_pre: float | None
    anxiety_post: float | None
