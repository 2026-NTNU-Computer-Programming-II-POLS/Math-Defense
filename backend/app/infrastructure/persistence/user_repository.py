"""SQLAlchemy implementation of UserRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy.orm import Session as DbSession

from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.models.user import User as UserModel


class SqlAlchemyUserRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_username(self, username: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.username == username).first()
        return self._to_domain(row) if row else None

    def find_by_email(self, email: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.email == email.lower()).first()
        return self._to_domain(row) if row else None

    def find_by_id(self, user_id: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.id == user_id).first()
        return self._to_domain(row) if row else None

    def find_by_role(self, role: Role) -> list[User]:
        rows = self._db.query(UserModel).filter(UserModel.role == role.value).all()
        return [self._to_domain(r) for r in rows]

    def save(self, user: User) -> None:
        row = self._db.query(UserModel).filter(UserModel.id == user.id).first()
        if row:
            row.username = user.username
            row.email = user.email
            row.player_name = user.player_name
            row.avatar_url = user.avatar_url
            row.role = user.role.value
            row.password_hash = user.password_hash
        else:
            row = UserModel(
                id=user.id,
                username=user.username,
                email=user.email,
                player_name=user.player_name,
                avatar_url=user.avatar_url,
                role=user.role.value,
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
            email=row.email,
            player_name=row.player_name,
            avatar_url=row.avatar_url,
            role=Role(row.role),
            password_hash=row.password_hash,
            created_at=_ensure_utc(row.created_at),
        )


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
