"""GameSessionRepository — 抽象介面（Protocol），不依賴 SQLAlchemy"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.session.aggregate import GameSession


class CumulativeStats:
    """Value object for aggregated user statistics across completed sessions."""
    __slots__ = ("total_kills", "total_score", "total_waves", "total_sessions", "stars_played")

    def __init__(
        self,
        total_kills: int,
        total_score: int,
        total_waves: int,
        total_sessions: int,
        stars_played: set[int],
    ) -> None:
        self.total_kills = total_kills
        self.total_score = total_score
        self.total_waves = total_waves
        self.total_sessions = total_sessions
        self.stars_played = stars_played


@runtime_checkable
class GameSessionRepository(Protocol):
    def find_by_id(self, session_id: str, user_id: str) -> GameSession | None: pass

    def find_by_id_for_update(self, session_id: str, user_id: str) -> GameSession | None:
        """Like find_by_id, but acquires a row-level lock to serialise
        duplicate-submission checks against concurrent writes."""
        pass
    def find_active_by_user(self, user_id: str) -> GameSession | None: pass

    def find_stale_sessions(self, user_id: str) -> list[GameSession]: pass

    def save(self, session: GameSession) -> None: pass

    def save_all(self, sessions: list[GameSession]) -> None: pass

    def get_cumulative_stats(self, user_id: str) -> CumulativeStats: pass

    def compute_ia_recent_accuracy(self, user_id: str, window: int = 10) -> float:
        """Fraction (0.0–1.0) of the user's last ``window`` completed sessions
        whose Initial-Answer phase was answered correctly.

        Returns 0.0 when the user has no completed sessions yet — new players
        therefore see fully-labelled paths until they accumulate evidence
        (spec §17, concrete-fading)."""
        pass

    def has_correct_ia_session(self, user_id: str) -> bool:
        """True iff the user has at least one session whose Initial-Answer
        phase was answered correctly (initial_answer flag set at creation).

        Used by the Star-5 unlock gate (see SessionApplicationService.create_session
        and the user-profile endpoint). Status is irrelevant — IA correctness is
        recorded at session creation and never overwritten, so even abandoned
        sessions satisfy the predicate."""
        pass

    def find_reflections_for_users(
        self, user_ids: list[str], limit: int = 100
    ) -> list[GameSession]:
        """Most-recent completed sessions with a non-empty reflection_text,
        scoped to the given users. Used by the teacher dashboard."""
        pass
