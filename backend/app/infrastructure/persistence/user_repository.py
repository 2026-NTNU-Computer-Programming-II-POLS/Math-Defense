"""SQLAlchemy implementation of UserRepository"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session as DbSession

from app.domain.errors import ConstraintViolationError
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.models.user import User as UserModel
from app.utils.encryption import decrypt_field, encrypt_field
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

    def lock_active_ids_by_role(self, role: Role) -> list[str]:
        """Row-lock every active user of `role` and return their ids.

        Takes FOR UPDATE on each matched row so concurrent "disable the last
        admin" transactions serialise on the same row set instead of both
        reading a stale count and both committing (a TOCTOU that could empty
        the active-admin set). ORDER BY id biases toward a consistent lock
        order to minimise deadlocks; the second transaction blocks, then
        re-evaluates the predicate against the freshly committed state and sees
        the just-disabled admin drop out. Even if the planner locks in scan
        order and a deadlock occurs, the invariant still holds: Postgres aborts
        one transaction, so at most one disable commits. No-op lock on SQLite,
        where FOR UPDATE is ignored.
        """
        rows = (
            self._db.query(UserModel.id)
            .filter(UserModel.role == role.value, UserModel.is_active.is_(True))
            .order_by(UserModel.id.asc())
            .with_for_update()
            .all()
        )
        return [r[0] for r in rows]

    def find_by_role_paginated(self, role: Role, offset: int, limit: int) -> tuple[list[User], int]:
        q = self._db.query(UserModel).filter(UserModel.role == role.value)
        total = q.count()
        # B-BUG-13: append .id as a tiebreaker so identical created_at
        # timestamps (bulk seeds) cannot duplicate / skip rows across pages.
        rows = (
            q.order_by(UserModel.created_at.desc(), UserModel.id.asc())
            .offset(offset).limit(limit).all()
        )
        return [self._to_domain(r) for r in rows], total

    @staticmethod
    def _encrypt_totp(secret: str | None) -> str | None:
        return encrypt_field(secret) if secret else None

    @staticmethod
    def _decrypt_totp(stored: str | None) -> str | None:
        return decrypt_field(stored) if stored else None

    def save(self, user: User) -> None:
        encrypted_totp = self._encrypt_totp(user.totp_secret)
        row = self._db.query(UserModel).filter(UserModel.id == user.id).first()
        if row:
            row.email = user.email
            row.player_name = user.player_name
            row.role = user.role.value
            row.is_active = user.is_active
            row.password_hash = user.password_hash
            row.password_version = user.password_version
            row.is_email_verified = user.is_email_verified
            row.totp_secret = encrypted_totp
            row.mfa_enabled = user.mfa_enabled
            row.totp_last_used_at = user.totp_last_used_at
            row.ia_recent_accuracy = user.ia_recent_accuracy
            row.endpoint_marker_style = user.endpoint_marker_style
            row.endpoint_marker_custom_dataurl = user.endpoint_marker_custom_dataurl
            row.endpoint_hit_fx = user.endpoint_hit_fx
            row.profile_initials_letters = user.profile_initials_letters
            row.profile_initials_color = user.profile_initials_color
        else:
            row = UserModel(
                id=user.id,
                email=user.email,
                player_name=user.player_name,
                role=user.role.value,
                is_active=user.is_active,
                password_hash=user.password_hash,
                password_version=user.password_version,
                created_at=user.created_at,
                is_email_verified=user.is_email_verified,
                totp_secret=encrypted_totp,
                mfa_enabled=user.mfa_enabled,
                totp_last_used_at=user.totp_last_used_at,
                ia_recent_accuracy=user.ia_recent_accuracy,
                endpoint_marker_style=user.endpoint_marker_style,
                endpoint_marker_custom_dataurl=user.endpoint_marker_custom_dataurl,
                endpoint_hit_fx=user.endpoint_hit_fx,
                profile_initials_letters=user.profile_initials_letters,
                profile_initials_color=user.profile_initials_color,
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

    @classmethod
    def _to_domain(cls, row: UserModel) -> User:
        return User(
            id=row.id,
            email=row.email,
            player_name=row.player_name,
            role=Role(row.role),
            is_active=row.is_active if row.is_active is not None else True,
            password_hash=row.password_hash,
            created_at=_ensure_utc(row.created_at),
            password_version=row.password_version or 0,
            is_email_verified=row.is_email_verified if row.is_email_verified is not None else False,
            totp_secret=cls._decrypt_totp(row.totp_secret),
            mfa_enabled=row.mfa_enabled if row.mfa_enabled is not None else False,
            totp_last_used_at=_ensure_utc(row.totp_last_used_at),
            ia_recent_accuracy=row.ia_recent_accuracy if row.ia_recent_accuracy is not None else 0.0,
            endpoint_marker_style=row.endpoint_marker_style,
            endpoint_marker_custom_dataurl=row.endpoint_marker_custom_dataurl,
            endpoint_hit_fx=row.endpoint_hit_fx,
            profile_initials_letters=row.profile_initials_letters,
            profile_initials_color=row.profile_initials_color,
        )


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
