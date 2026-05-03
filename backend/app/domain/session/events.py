"""GameSession Domain Events — significant state changes in the session lifecycle"""
from dataclasses import dataclass


@dataclass(frozen=True)
class SessionCreated:
    session_id: str
    user_id: str
    level: int


@dataclass(frozen=True)
class SessionUpdated:
    session_id: str


@dataclass(frozen=True)
class SessionCompleted:
    """Session completed — the Leaderboard BC consumes this event to auto-create a leaderboard entry"""
    session_id: str
    user_id: str
    level: int
    score: int
    kills: int
    waves_survived: int
    total_score: float | None = None


@dataclass(frozen=True)
class SessionAbandoned:
    session_id: str
