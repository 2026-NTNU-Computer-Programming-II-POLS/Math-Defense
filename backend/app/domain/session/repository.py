"""GameSessionRepository — 抽象介面（Protocol），不依賴 SQLAlchemy"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.session.aggregate import GameSession


@runtime_checkable
class GameSessionRepository(Protocol):
    def find_by_id(self, session_id: str, user_id: str) -> GameSession | None: ...

    def find_by_id_for_update(self, session_id: str, user_id: str) -> GameSession | None:
        """Like find_by_id, but acquires a row-level lock to serialise
        duplicate-submission checks against concurrent writes."""
        ...

    def find_active_by_user(self, user_id: str) -> GameSession | None: ...

    def find_stale_sessions(self, user_id: str) -> list[GameSession]: ...

    def save(self, session: GameSession) -> None: ...

    def save_all(self, sessions: list[GameSession]) -> None: ...
