"""Territory difficulty-recommendation strategy — pure domain logic.

Given a student's recent session scores per level and the current slot
roster, propose a slot the student should consider. The strategy never
hits the DB and never returns localized prose — the application layer
loads data, the frontend localizes the rationale code.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class RecommendationConfig:
    """All thresholds in one place — tune without touching service logic."""
    sessions_to_consider: int = 10
    safe_score_threshold: float = 3000.0
    max_star_rating: int = 5


@dataclass(frozen=True)
class SlotSnapshot:
    id: str
    index: int
    star_rating: int
    occupant_id: str | None
    occupant_score: float | None

    @property
    def is_unoccupied(self) -> bool:
        return self.occupant_id is None


@dataclass(frozen=True)
class RecommendationResult:
    slot_id: str
    slot_index: int
    star_rating: int
    rationale_code: str
    user_avg_at_target: float | None
    occupant_score: float | None


@dataclass(frozen=True)
class TerritoryRecommendationStrategy:
    """Pure, deterministic recommendation rule.

    1. Compute the highest level the student is "comfortable" at —
       defined as average score >= safe_score_threshold over their
       recent sessions.
    2. Target one level above that (capped at max_star_rating).
    3. Among slots at the target level, prefer in this order:
       unoccupied → held by someone else → already held by user.
       Falls back to any unoccupied slot at any level if no
       target-level slot is available.
    """
    config: RecommendationConfig = field(default_factory=RecommendationConfig)

    def recommend(
        self,
        avg_score_by_level: dict[int, float],
        slots: list[SlotSnapshot],
        user_id: str,
    ) -> RecommendationResult | None:
        comfortable = max(
            (lvl for lvl, avg in avg_score_by_level.items() if avg >= self.config.safe_score_threshold),
            default=0,
        )
        target_level = min(comfortable + 1, self.config.max_star_rating)

        prio: tuple[list[SlotSnapshot], ...] = (
            [s for s in slots if s.is_unoccupied and s.star_rating == target_level],
            [s for s in slots if s.occupant_id is not None and s.occupant_id != user_id and s.star_rating == target_level],
            [s for s in slots if s.occupant_id == user_id and s.star_rating == target_level],
            [s for s in slots if s.is_unoccupied],
        )
        candidate: SlotSnapshot | None = next((s for tier in prio for s in tier), None)
        if candidate is None:
            return None

        # ``first_attempt`` is reserved for cold-start (no completed sessions).
        # A user with completed sessions but no comfortable level still gets
        # ``step_up_one_level`` — they have a baseline; the recommended slot
        # is the next rung up regardless.
        rationale = "first_attempt" if not avg_score_by_level else "step_up_one_level"
        return RecommendationResult(
            slot_id=candidate.id,
            slot_index=candidate.index,
            star_rating=candidate.star_rating,
            rationale_code=rationale,
            user_avg_at_target=avg_score_by_level.get(target_level),
            occupant_score=candidate.occupant_score,
        )
