"""GameSessionRepository — 抽象介面（Protocol），不依賴 SQLAlchemy"""
from __future__ import annotations

from typing import Protocol

from app.domain.session.aggregate import GameSession


class GameSessionRepository(Protocol):
    def find_by_id(self, session_id: str, user_id: str) -> GameSession | None: ...

    def find_active_by_user(self, user_id: str) -> GameSession | None: ...

    def find_stale_sessions(self, user_id: str) -> list[GameSession]: ...

    def save(self, session: GameSession) -> None: ...

    def save_all(self, sessions: list[GameSession]) -> None: ...
