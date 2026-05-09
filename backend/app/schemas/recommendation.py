"""Pydantic schemas for the recommendation router (Pedagogical_Backlog_Spec §28)."""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict


class TerritoryRecommendationOut(BaseModel):
    """Per-activity slot suggestion returned by the territory recommender.

    The endpoint can also return ``null`` (the strategy has no usable
    candidate); the frontend renders that as no recommendation banner.
    """
    model_config = ConfigDict(extra="ignore")

    slot_id: str
    slot_index: int
    star_rating: int
    rationale_code: Literal["step_up_one_level", "first_attempt"]
    user_avg_at_target: float | None = None
    occupant_score: float | None = None


class RecommendationOut(BaseModel):
    model_config = ConfigDict(extra="ignore")

    # Suggested star difficulty in [1, 5]; advisory only.
    star: int
    # Weighted competency mean used to derive ``star``. Surfaced for the
    # frontend to render an explanatory tooltip ("based on a 0.62 mastery
    # estimate").
    weighted_mean: float
    # Competency enum value (e.g. "MAGIC", "LIMIT") — the lowest-mean
    # competency for the user.
    lowest_competency: str
    # Posterior mean for ``lowest_competency`` so the UI can phrase the
    # talent-tree highlight ("LIMIT 0.32 — focus here").
    lowest_mean: float
    # Talent node id to highlight on the talent tree, or null when the
    # lowest competency has no talent surface (PROBABILITY).
    talent_node_id: str | None
