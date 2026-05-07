"""LeaderboardRepository — abstract interface"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.leaderboard.view import RankedLeaderboardEntry


@runtime_checkable
class LeaderboardRepository(Protocol):
    def find_by_session_id(self, session_id: str) -> LeaderboardEntry | None: pass

    def save(self, entry: LeaderboardEntry) -> None: pass

    def query_ranked_global(
        self,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        """Global DENSE_RANK across all levels."""
        pass
    def query_ranked_by_level(
        self,
        level: int,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        """Per-level DENSE_RANK restricted to the given level."""
        pass
    def query_ranked_by_class(
        self,
        class_id: str,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        """Class-scoped ranking — best score per student in the class."""
        pass

    def query_ranked_by_challenge(
        self,
        challenge_id: str,
        page: int,
        per_page: int,
    ) -> tuple[list[RankedLeaderboardEntry], int]:
        """Challenge-scoped ranking — entries tagged with challenge_id (Backlog §23)."""
        pass

    def get_user_history(
        self,
        user_id: str,
        level: int | None = None,
    ) -> list[LeaderboardEntry]:
        """Personal history — all of a user's entries, newest first.

        Optional ``level`` filter scopes the timeline to a single star-rating.
        Caller (application service) applies personal-best markers.
        """
        pass