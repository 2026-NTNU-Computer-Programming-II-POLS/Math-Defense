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
        challenge_id: str | None = None,
        total_score: float | None = None,
        created_at: datetime | None = None,
    ) -> None:
        if not isinstance(level, Level):
            raise DomainValueError("level must be a Level instance")
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
        # Backlog §23 — non-NULL when entry comes from a challenge run.
        self.challenge_id = challenge_id
        # M-02: V2 floating-point total_score; None for v1 sessions or missing context.
        self.total_score = total_score
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
        challenge_id: str | None = None,
        total_score: float | None = None,
    ) -> LeaderboardEntry:
        """Build a leaderboard entry from a completed session."""
        return cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            level=Level(level),
            score=Score(score),
            kills=kills,
            waves_survived=waves_survived,
            session_id=session_id,
            challenge_id=challenge_id,
            total_score=total_score,
        )
