"""LeaderboardEntry Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC

from app.domain.errors import DomainValueError
from app.domain.value_objects import Level, Score


class LeaderboardEntry:
    """
    Leaderboard entry aggregate root.

    Invariants (enforced in __init__):
    1. One entry per session_id (guaranteed by the repository layer).
    2. kills >= 0, waves_survived >= 0.
    3. score non-negativity is guarded by the Score value object.
    """

    def __init__(
        self,
        id: str,
        user_id: str | None,
        level: Level,
        score: Score,
        kills: int,
        waves_survived: int,
        session_id: str | None = None,
        created_at: datetime | None = None,
    ) -> None:
        if kills < 0:
            raise DomainValueError("kills must be non-negative")
        if waves_survived < 0:
            raise DomainValueError("waves_survived must be non-negative")
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
