"""AuthApplicationService — user registration, login, and token authentication"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.errors import (
    AccountLockedError,
    DomainValueError,
    InvalidCredentialsError,
    InvalidTokenError,
    UserNotFoundError,
)
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Email, Role
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
)

if TYPE_CHECKING:
    from app.domain.auth.repository import (
        LoginAttemptRepository,
        TokenDenylistRepository,
    )
    from app.domain.user.repository import UserRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)

_DUMMY_PASSWORD_HASH = hash_password("__timing_equaliser__")


class AuthApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        login_attempt_repo: LoginAttemptRepository,
        token_denylist_repo: TokenDenylistRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._user_repo = user_repo
        self._login_attempts = login_attempt_repo
        self._token_denylist = token_denylist_repo
        self._uow = uow

    def register(
        self,
        email: str,
        password: str,
        player_name: str,
        role: str = "student",
    ) -> tuple[User, str]:
        """Create a new user and issue an access token. Returns (user, token)."""
        try:
            email_vo = Email(email)
        except ValueError as e:
            raise DomainValueError(str(e)) from e

        try:
            role_enum = Role(role)
        except ValueError:
            raise DomainValueError(f"Invalid role: {role}. Must be one of: admin, teacher, student")

        password_hash = hash_password(password)
        with self._uow:
            if self._user_repo.find_by_email(email_vo.value):
                raise DomainValueError("Email already registered")
            user = User.create(
                email=email_vo.value,
                player_name=player_name,
                role=role_enum,
                password_hash=password_hash,
            )
            self._user_repo.save(user)
            try:
                self._uow.commit()
            except IntegrityError as e:
                raise DomainValueError("Email already registered") from e
        token = create_access_token({"sub": user.id, "role": user.role.value})
        return user, token

    def login(self, email: str, password: str) -> tuple[User, str]:
        """Authenticate credentials and issue an access token."""
        email_lower = email.strip().lower()
        with self._uow:
            if self._login_attempts.is_locked(email_lower):
                raise AccountLockedError(
                    "Account temporarily locked due to too many failed attempts. "
                    "Try again in a few minutes."
                )

            user = self._user_repo.find_by_email(email_lower)
            if user is None:
                verify_password(password, _DUMMY_PASSWORD_HASH)
                self._login_attempts.record_failure(email_lower)
                self._uow.commit()
                raise InvalidCredentialsError("Invalid email or password")
            if not verify_password(password, user.password_hash):
                self._login_attempts.record_failure(email_lower)
                self._uow.commit()
                raise InvalidCredentialsError("Invalid email or password")
            self._login_attempts.clear(email_lower)
            self._uow.commit()
        token = create_access_token({"sub": user.id, "role": user.role.value})
        return user, token

    def authenticate_token(self, token: str) -> User:
        """Decode a bearer token and return the owning user."""
        payload = decode_token(token)
        if payload is None:
            raise InvalidTokenError("Token is invalid or expired")
        jti = payload.get("jti")
        if jti and self._token_denylist.is_denied(jti):
            raise InvalidTokenError("Token has been revoked")
        user_id = payload.get("sub")
        if not user_id:
            raise InvalidTokenError("Token format error")
        user = self._user_repo.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError("User not found")
        return user

    def change_password(self, user_id: str, current_password: str, new_password: str) -> None:
        """Verify current password and replace it with the new one."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            if not verify_password(current_password, user.password_hash):
                raise InvalidCredentialsError("Current password is incorrect")
            user.password_hash = hash_password(new_password)
            self._user_repo.save(user)
            self._uow.commit()

    def update_avatar(self, user_id: str, avatar_url: str | None) -> User:
        """Persist the user's chosen avatar URL."""
        with self._uow:
            user = self._user_repo.find_by_id(user_id)
            if user is None:
                raise UserNotFoundError("User not found")
            user.avatar_url = avatar_url
            self._user_repo.save(user)
            self._uow.commit()
        return user

    def logout_token(self, token: str) -> None:
        """Revoke a token by adding its JTI to the deny-list."""
        payload = decode_token(token)
        if payload is None:
            return
        jti = payload.get("jti")
        exp = payload.get("exp", 0)
        if not jti:
            return
        with self._uow:
            self._token_denylist.deny(jti, float(exp))
            self._uow.commit()
