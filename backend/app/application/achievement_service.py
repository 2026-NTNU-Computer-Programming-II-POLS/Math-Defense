"""AchievementApplicationService — evaluates and unlocks achievements after session completion"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.achievement.aggregate import UserAchievement
from app.domain.achievement.definitions import ACHIEVEMENT_DEFS, get_all_defs
from app.domain.achievement import policy as achievement_policy

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.achievement.repository import AchievementRepository
    from app.domain.session.repository import GameSessionRepository, CumulativeStats

logger = logging.getLogger(__name__)


class AchievementApplicationService:
    def __init__(
        self,
        achievement_repo: AchievementRepository,
        session_repo: GameSessionRepository,
        uow: UnitOfWork,
    ) -> None:
        self._achievement_repo = achievement_repo
        self._session_repo = session_repo
        self._uow = uow

    def get_all_for_user(self, user_id: str) -> list[dict]:
        unlocked = {a.achievement_id: a for a in self._achievement_repo.find_by_user(user_id)}
        result = []
        for d in get_all_defs():
            result.append({
                "id": d.id,
                "name": d.name,
                "description": d.description,
                "category": d.category,
                "talent_points": d.talent_points,
                "unlocked": d.id in unlocked,
                "unlocked_at": unlocked[d.id].unlocked_at.isoformat() if d.id in unlocked else None,
            })
        return result

    def get_unlocked_for_user(self, user_id: str) -> list[UserAchievement]:
        return self._achievement_repo.find_by_user(user_id)

    def get_summary(self, user_id: str) -> dict:
        unlocked_count = self._achievement_repo.count_by_user(user_id)
        total_earned = self._achievement_repo.sum_talent_points(user_id)
        return {
            "unlocked": unlocked_count,
            "total": len(ACHIEVEMENT_DEFS),
            "talent_points_earned": total_earned,
        }

    def check_and_unlock(
        self,
        user_id: str,
        session_score: int,
        session_kills: int,
        session_waves: int,
        session_star: int,
        session_hp_lost: int,
        session_gold_remaining: int,
        territories_held: int = 0,
        territory_max_star: int = 0,
    ) -> list[UserAchievement]:
        unlocked_ids = {a.achievement_id for a in self._achievement_repo.find_by_user(user_id)}
        stats = self._session_repo.get_cumulative_stats(user_id)
        newly_unlocked: list[UserAchievement] = []

        for d in get_all_defs():
            if d.id in unlocked_ids:
                continue
            if achievement_policy.evaluate(
                d, stats, session_score, session_kills, session_waves,
                session_star, session_hp_lost, session_gold_remaining,
                territories_held, territory_max_star,
            ):
                achievement = UserAchievement.create(user_id, d.id, d.talent_points)
                self._achievement_repo.save(achievement)
                newly_unlocked.append(achievement)
                logger.info("Achievement unlocked: user=%s achievement=%s", user_id, d.id)

        return newly_unlocked
