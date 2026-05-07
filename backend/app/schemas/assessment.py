"""Pydantic schemas for the assessment router (Pedagogical_Backlog_Spec §9)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class BetaSummaryOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    alpha: float
    beta: float
    mean: float
    ci_low: float
    ci_high: float


class StudentCompetencyOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    student_id: str
    student_name: str
    # Keys are Competency enum values (e.g. "MAGIC", "LIMIT") so the frontend
    # can index by canonical name rather than display order.
    posteriors: dict[str, BetaSummaryOut]
    lowest_competency: str
    suggestion: str


class ClassPosteriorsOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    class_id: str
    students: list[StudentCompetencyOut]
