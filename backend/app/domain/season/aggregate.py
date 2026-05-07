"""Season aggregate.

Models a time-bounded promotion of a set of achievements (Pedagogical_Backlog_Spec.md §22).
Achievements whose ``season_id`` matches an active season grant a 2x talent-point award.
"""
from __future__ import annotations

from datetime import datetime, UTC


class Season:
    SEASON_REWARD_MULTIPLIER: int = 2

    def __init__(
        self,
        season_id: str,
        name: str,
        starts_at: datetime,
        ends_at: datetime,
    ) -> None:
        if not season_id:
            raise ValueError("season_id must not be empty")
        if not name:
            raise ValueError("name must not be empty")
        if starts_at.tzinfo is None or ends_at.tzinfo is None:
            raise ValueError("season timestamps must be timezone-aware")
        if ends_at <= starts_at:
            raise ValueError("ends_at must be after starts_at")
        self.season_id = season_id
        self.name = name
        self.starts_at = starts_at
        self.ends_at = ends_at

    def is_active(self, now: datetime | None = None) -> bool:
        ref = now or datetime.now(UTC)
        return self.starts_at <= ref < self.ends_at

    @classmethod
    def create(
        cls,
        season_id: str,
        name: str,
        starts_at: datetime,
        ends_at: datetime,
    ) -> "Season":
        return cls(season_id=season_id, name=name, starts_at=starts_at, ends_at=ends_at)
