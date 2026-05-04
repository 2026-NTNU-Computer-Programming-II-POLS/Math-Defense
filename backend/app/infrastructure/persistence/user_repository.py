"""SQLAlchemy implementation of UserRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.domain.errors import ConstraintViolationError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.models.user import User as UserModel
from app.utils.integrity import extract_constraint_name


class SqlAlchemyUserRepository:

    def __init__(self, db: DbSession):
        self._db = db

    def find_by_email(self, email: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.email == email.lower()).first()
        return self._to_domain(row) if row else None

    def find_by_id(self, user_id: str) -> User | None:
        row = self._db.query(UserModel).filter(UserModel.id == user_id).first()
        return self._to_domain(row) if row else None

    def find_by_ids(self, user_ids: list[str]) -> list[User]:
        if not user_ids:
            return []
        rows = self._db.query(UserModel).filter(UserModel.id.in_(user_ids)).all()
        return [self._to_domain(r) for r in rows]

    def find_by_role(self, role: Role) -> list[User]:
        rows = self._db.query(UserModel).filter(UserModel.role == role.value).all()
        return [self._to_domain(r) for r in rows]

    def find_by_role_paginated(self, role: Role, offset: int, limit: int) -> tuple[list[User], int]:
        q = self._db.query(UserModel).filter(UserModel.role == role.value)
        total = q.count()
        rows = q.order_by(UserModel.created_at.desc()).offset(offset).limit(limit).all()
        return [self._to_domain(r) for r in rows], total

    def save(self, user: User) -> None:
        row = self._db.query(UserModel).filter(UserModel.id == user.id).first()
        if row:
            row.email = user.email
            row.player_name = user.player_name
            row.avatar_url = user.avatar_url
            row.role = user.role.value
            row.is_active = user.is_active
            row.password_hash = user.password_hash
            row.password_version = user.password_version
            row.is_email_verified = user.is_email_verified
            row.totp_secret = user.totp_secret
            row.mfa_enabled = user.mfa_enabled
            row.totp_last_used_at = user.totp_last_used_at
        else:
            row = UserModel(
                id=user.id,
                email=user.email,
                player_name=user.player_name,
                avatar_url=user.avatar_url,
                role=user.role.value,
                is_active=user.is_active,
                password_hash=user.password_hash,
                password_version=user.password_version,
                created_at=user.created_at,
                is_email_verified=user.is_email_verified,
                totp_secret=user.totp_secret,
                mfa_enabled=user.mfa_enabled,
                totp_last_used_at=user.totp_last_used_at,
            )
            self._db.add(row)
        self._flush()

    def _flush(self) -> None:
        try:
            self._db.flush()
        except IntegrityError as e:
            raise ConstraintViolationError(
                str(e), constraint_name=extract_constraint_name(e)
            ) from e

    @staticmethod
    def _to_domain(row: UserModel) -> User:
        return User(
            id=row.id,
            email=row.email,
            player_name=row.player_name,
            avatar_url=row.avatar_url,
            role=Role(row.role),
            is_active=row.is_active if row.is_active is not None else True,
            password_hash=row.password_hash,
            created_at=_ensure_utc(row.created_at),
            password_version=row.password_version or 0,
            is_email_verified=row.is_email_verified if row.is_email_verified is not None else False,
            totp_secret=row.totp_secret,
            mfa_enabled=row.mfa_enabled if row.mfa_enabled is not None else False,
            totp_last_used_at=_ensure_utc(row.totp_last_used_at),
        )


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
