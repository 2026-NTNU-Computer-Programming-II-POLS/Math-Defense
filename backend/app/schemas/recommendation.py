"""Pydantic schemas for the recommendation router (Pedagogical_Backlog_Spec §28)."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


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
