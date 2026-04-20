"""SQLAlchemy implementation of LoginAttemptRepository.

Thin adapter over the pure functions in ``app.infrastructure.login_guard``.
Exists so the Application layer depends only on the
``LoginAttemptRepository`` Protocol and never sees a raw SQLAlchemy Session.
"""
from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.infrastructure import login_guard


class SqlAlchemyLoginAttemptRepository:

    def __init__(self, db: DbSession) -> None:
        self._db = db

    def is_locked(self, username: str) -> bool:
        return login_guard.is_locked(self._db, username)

    def record_failure(self, username: str) -> None:
        login_guard.record_failure(self._db, username)

    def clear(self, username: str) -> None:
        login_guard.record_success(self._db, username)
