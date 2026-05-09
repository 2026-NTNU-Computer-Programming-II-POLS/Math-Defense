"""TerritoryRecommendationApplicationService — feeds the territory
difficulty recommender with data, returns the strategy's verdict.

Distinct from ``recommender_service.py`` (talent + star-difficulty
suggestion driven by the competency posterior) — that surface answers
"which star should you practice?" globally, while this surface answers
"which slot should you try?" within a specific territory activity.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.domain.territory.errors import ActivityNotFoundError
from app.domain.territory.recommendation import (
    RecommendationConfig,
    RecommendationResult,
    SlotSnapshot,
    TerritoryRecommendationStrategy,
)
from app.domain.user.value_objects import Role

if TYPE_CHECKING:
    from app.domain.class_.repository import ClassRepository
    from app.domain.session.repository import GameSessionRepository
    from app.domain.territory.repository import TerritoryRepository


class TerritoryRecommendationApplicationService:

    def __init__(
        self,
        session_repo: "GameSessionRepository",
        territory_repo: "TerritoryRepository",
        class_repo: "ClassRepository",
        strategy: TerritoryRecommendationStrategy | None = None,
    ) -> None:
        self._session_repo = session_repo
        self._territory_repo = territory_repo
        self._class_repo = class_repo
        self._strategy = strategy or TerritoryRecommendationStrategy()

    def recommend_for_activity(
        self, activity_id: str, user_id: str, user_role: Role,
    ) -> RecommendationResult | None:
        activity = self._territory_repo.find_activity_by_id_with_slots(activity_id)
        if activity is None:
            raise ActivityNotFoundError("Activity not found")
        # Mirror TerritoryApplicationService._verify_activity_access so the
        # recommendation surface cannot be used to enumerate slots in
        # activities the caller cannot access.
        if user_role == Role.ADMIN:
            pass
        elif user_role == Role.TEACHER:
            if activity.class_id is not None and activity.teacher_id != user_id:
                raise ActivityNotFoundError("Activity not found")
        else:
            if activity.class_id is not None:
                membership = self._class_repo.find_membership(activity.class_id, user_id)
                if membership is None:
                    raise ActivityNotFoundError("Activity not found")

        sessions = self._session_repo.find_recent_completed_by_student(
            student_id=user_id,
            limit=self._strategy.config.sessions_to_consider,
        )
        avg_by_level = self._average_score_by_level(sessions)
        slot_snapshots = [
            SlotSnapshot(
                id=s.id,
                index=s.slot_index,
                star_rating=s.star_rating,
                occupant_id=s.occupation.student_id if s.occupation else None,
                occupant_score=s.occupation.score if s.occupation else None,
            )
            for s in activity.slots
        ]
        return self._strategy.recommend(avg_by_level, slot_snapshots, user_id)

    @staticmethod
    def _average_score_by_level(sessions) -> dict[int, float]:
        buckets: dict[int, list[float]] = {}
        for s in sessions:
            score = s.total_score if s.total_score is not None else float(s.score)
            buckets.setdefault(int(s.level), []).append(score)
        return {lvl: sum(v) / len(v) for lvl, v in buckets.items() if v}
