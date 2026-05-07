"""RecommenderApplicationService — Pedagogical_Backlog_Spec.md §28.

Reads the per-user competency posterior (built by §8) and returns two
learner-facing steers: a suggested star difficulty and a talent-tree root
node tied to the lowest competency. The output is *advisory* — SDT autonomy
literature (Ryan & Deci 2000) is explicit that nudging is fine but gating is
not, so the route never blocks a player from picking any star themselves.

Both rules are deterministic over the posteriors so the same input always
produces the same suggestion (the dashboard must not flicker on refresh).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.assessment import Competency, CompetencyState, mean


# Spec §28.3 — exact step boundaries. Editing a threshold is a curriculum
# change, not a typo fix; the parity test in test_recommender.py asserts
# each posterior-range maps to the documented star.
_STAR_THRESHOLDS: list[tuple[float, int]] = [
    (0.30, 1),
    (0.50, 2),
    (0.70, 3),
    (0.85, 4),
]
_STAR_TOP = 5


# Spec §28.3 — competency → talent root node. Talent ids in
# `frontend/src/data/talent-defs.ts` do not literally use the `_root`
# suffix from the spec, so each entry resolves to the actual prereq-empty
# node for the corresponding tower. CHAIN_RULE has no dedicated tower but
# the chain-rule diagnostic loads on Calculus, so we point its
# recommendation at the Calculus root. PROBABILITY has no talent surface
# (Monty-Hall is not a tower), so it returns None — the frontend falls
# back to no highlight rather than showing a misleading suggestion.
_TALENT_ROOT_BY_COMPETENCY: dict[Competency, str | None] = {
    Competency.MAGIC: "magic_zone_strength",
    Competency.RADAR: "radar_a_range",
    Competency.MATRIX: "matrix_range",
    Competency.LIMIT: "limit_damage",
    Competency.CALCULUS: "calculus_pet_speed",
    Competency.CHAIN_RULE: "calculus_pet_speed",
    Competency.PROBABILITY: None,
}


class CompetencyStateRepository(Protocol):
    def find_by_user(self, user_id: str) -> CompetencyState: ...


@dataclass(frozen=True)
class Recommendation:
    """Read model returned by the recommender to the router."""

    star: int
    weighted_mean: float
    lowest_competency: Competency
    lowest_mean: float
    talent_node_id: str | None


def _star_for_mean(weighted_mean: float) -> int:
    """Map a posterior mean ∈ [0, 1] to a star difficulty per §28.3."""
    for threshold, star in _STAR_THRESHOLDS:
        if weighted_mean < threshold:
            return star
    return _STAR_TOP


class RecommenderApplicationService:
    def __init__(self, competency_repo: CompetencyStateRepository) -> None:
        self._repo = competency_repo

    def recommend_star(self, user_id: str) -> int:
        """Return the suggested star (1–5) for ``user_id``.

        v1 uses the unweighted mean across all seven competencies. The spec
        anticipates per-tower weighting once we track which tower the
        player typically uses, but that telemetry does not yet exist on
        ``GameSession`` — switching to a weighted mean is a future change
        gated by data, not a bug here. The acceptance criterion ("new user
        with uniform prior sees Star 3") is invariant under that change.
        """
        return self._compute(user_id).star

    def recommend_talent_node(self, user_id: str) -> str | None:
        """Return the talent root node tied to the player's lowest
        competency, or ``None`` if the lowest competency has no talent
        surface (e.g. PROBABILITY)."""
        return self._compute(user_id).talent_node_id

    def get_recommendation(self, user_id: str) -> Recommendation:
        """Return both recommendations in one round-trip — the router
        composes them into a single response so the frontend renders
        consistent advice on each surface."""
        return self._compute(user_id)

    def _compute(self, user_id: str) -> Recommendation:
        state = self._repo.find_by_user(user_id)
        posteriors = state.all_posteriors()
        means = {c: mean(b) for c, b in posteriors.items()}
        weighted_mean = sum(means.values()) / len(means)
        # Tie-break by Competency declaration order so two competencies at
        # the uniform prior always map to the same suggestion across requests.
        ordered = list(Competency)
        lowest = min(ordered, key=lambda c: (means[c], ordered.index(c)))
        return Recommendation(
            star=_star_for_mean(weighted_mean),
            weighted_mean=weighted_mean,
            lowest_competency=lowest,
            lowest_mean=means[lowest],
            talent_node_id=_TALENT_ROOT_BY_COMPETENCY[lowest],
        )
