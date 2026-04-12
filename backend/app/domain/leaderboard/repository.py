"""LeaderboardRepository — 抽象介面"""
from __future__ import annotations

from typing import Protocol

from app.domain.leaderboard.aggregate import LeaderboardEntry


class LeaderboardRepository(Protocol):
    def find_by_session_id(self, session_id: str) -> LeaderboardEntry | None: ...

    def save(self, entry: LeaderboardEntry) -> None: ...

    def query_ranked(
        self,
        level: int | None,
        page: int,
        per_page: int,
    ) -> tuple[list[dict], int]:
        """回傳 (entries_with_rank, total_count)
        每個 dict 包含: rank, username, level, score, kills, waves_survived, created_at
        """
        ...
