"""SQLAlchemy implementation of UserRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy.orm import Session as DbSession

from app.domain.user.aggregate import User
from app.models.user import User as UserModel


class SqlAlchemyUserRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_username(self, username: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.username == username).first()
        return self._to_domain(row) if row else None

    def find_by_id(self, user_id: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.id == user_id).first()
        return self._to_domain(row) if row else None

    def save(self, user: User) -> None:
        row = self._db.query(UserModel).filter(UserModel.id == user.id).first()
        if row:
            row.username = user.username
            row.password_hash = user.password_hash
        else:
            row = UserModel(
                id=user.id,
                username=user.username,
                password_hash=user.password_hash,
                created_at=user.created_at,
            )
            self._db.add(row)
        self._db.flush()

    @staticmethod
    def _to_domain(row: UserModel) -> User:
        return User(
            id=row.id,
            username=row.username,
            password_hash=row.password_hash,
            created_at=_ensure_utc(row.created_at),
        )


def _ensure_utc(value: datetime | None) -> datetime | None:
    # SQLite returns naive datetimes; normalise to aware UTC so callers can
    # compare safely against datetime.now(UTC).
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
