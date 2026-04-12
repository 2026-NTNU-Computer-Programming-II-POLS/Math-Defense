"""LeaderboardEntry Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC

from app.domain.value_objects import Level, Score


class LeaderboardEntry:
    """
    排行榜條目聚合根。

    不變量：
    1. 一個 session_id 只能對應一筆條目（由 Repository 層確保）
    2. 分數、擊殺數、存活波數不可為負
    """

    def __init__(
        self,
        id: str,
        user_id: str,
        level: Level,
        score: Score,
        kills: int,
        waves_survived: int,
        session_id: str | None = None,
        created_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.user_id = user_id
        self.level = level
        self.score = score
        self.kills = kills
        self.waves_survived = waves_survived
        self.session_id = session_id
        self.created_at = created_at or datetime.now(UTC)

    @classmethod
    def create_from_session(
        cls,
        user_id: str,
        level: int,
        score: int,
        kills: int,
        waves_survived: int,
        session_id: str,
    ) -> LeaderboardEntry:
        """從完成的場次建立排行榜條目"""
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            level=Level(level),
            score=Score(score),
            kills=kills,
            waves_survived=waves_survived,
            session_id=session_id,
        )
