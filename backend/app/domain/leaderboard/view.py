"""Leaderboard read-model DTO.

Separate from the LeaderboardEntry aggregate because the ranked view carries
fields that the aggregate does not own (rank is computed by the repository,
username is joined from the User aggregate). Exposing this DTO instead of a
raw dict keeps ORM shape from leaking into the router.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class RankedLeaderboardEntry:
    id: str
    rank: int
    player_name: str
    level: int
    score: int
    kills: int
    waves_survived: int
    created_at: datetime
