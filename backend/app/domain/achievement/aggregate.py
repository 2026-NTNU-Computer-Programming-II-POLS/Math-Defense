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
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            achievement_id=achievement_id,
            talent_points=talent_points,
        )
