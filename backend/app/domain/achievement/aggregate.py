"""UserAchievement Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC


class UserAchievement:
    def __init__(
        self,
        id: str,
        user_id: str,
        achievement_id: str,
        talent_points: int,
        unlocked_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.user_id = user_id
        self.achievement_id = achievement_id
        self.talent_points = talent_points
        self.unlocked_at = unlocked_at or datetime.now(UTC)

    @classmethod
    def create(cls, user_id: str, achievement_id: str, talent_points: int) -> UserAchievement:
        if not user_id:
            raise ValueError("user_id must not be empty")
        if not achievement_id:
            raise ValueError("achievement_id must not be empty")
        if talent_points < 0:
            raise ValueError("talent_points must not be negative")
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            achievement_id=achievement_id,
            talent_points=talent_points,
        )
