"""SQLAlchemy implementation of TokenDenylistRepository."""
from __future__ import annotations

from sqlalchemy.orm import Session as DbSession

from app.infrastructure import token_denylist


class SqlAlchemyTokenDenylistRepository:

    def __init__(self, db: DbSession) -> None:
        self._db = db

    def deny(self, jti: str, expires_at: float) -> None:
        token_denylist.deny(self._db, jti, expires_at)

    def is_denied(self, jti: str) -> bool:
        return token_denylist.is_denied(self._db, jti)
