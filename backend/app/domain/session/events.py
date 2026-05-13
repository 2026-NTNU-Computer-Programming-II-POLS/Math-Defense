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
    # Backlog §23: when set, the leaderboard entry is tagged with this id so
    # it ranks under the challenge-specific view, not the global / per-level one.
    challenge_id: str | None = None
    # B-BUG-20: surfaced on the event so the leaderboard handler can skip
    # practice-mode runs without re-reading the session row.
    practice_mode: bool = False


@dataclass(frozen=True)
class SessionAbandoned:
    session_id: str
