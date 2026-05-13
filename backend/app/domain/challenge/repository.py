"""ChallengeRepository — abstract interface (Protocol)."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.challenge.aggregate import Challenge


@runtime_checkable
class ChallengeRepository(Protocol):
    def find_by_id(self, challenge_id: str) -> Challenge | None: ...

    def find_by_teacher(self, teacher_id: str) -> list[Challenge]: ...

    def save(self, challenge: Challenge) -> None: ...

    def has_play_history(self, challenge_id: str) -> bool:
        """True if at least one LeaderboardEntry references this challenge.

        Used by ChallengeApplicationService to enforce the
        ``constraints-immutable-after-first-play`` invariant. Implementations
        join via leaderboard_entries.challenge_id.
        """
        ...
