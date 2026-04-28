"""AchievementRepository — abstract interface (Protocol)"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.achievement.aggregate import UserAchievement


@runtime_checkable
class AchievementRepository(Protocol):
    def find_by_user(self, user_id: str) -> list[UserAchievement]: ...

    def find_by_user_and_achievement(self, user_id: str, achievement_id: str) -> UserAchievement | None: ...

    def save(self, achievement: UserAchievement) -> None: ...

    def delete_by_user(self, user_id: str) -> None: ...

    def count_by_user(self, user_id: str) -> int: ...

    def sum_talent_points(self, user_id: str) -> int: ...
