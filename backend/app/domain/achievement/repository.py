"""AchievementRepository — abstract interface (Protocol)"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.achievement.aggregate import UserAchievement


@runtime_checkable
class AchievementRepository(Protocol):
    def find_by_user(self, user_id: str) -> list[UserAchievement]: pass

    def find_by_user_and_achievement(self, user_id: str, achievement_id: str) -> UserAchievement | None: pass

    def save(self, achievement: UserAchievement) -> None: pass

    def delete_by_user(self, user_id: str) -> None: pass

    def count_by_user(self, user_id: str) -> int: pass

    def sum_talent_points(self, user_id: str) -> int: pass
