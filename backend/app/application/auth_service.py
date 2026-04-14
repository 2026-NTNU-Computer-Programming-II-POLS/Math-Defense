"""AuthApplicationService — user registration, login, and token authentication"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.errors import (
    InvalidCredentialsError,
    InvalidTokenError,
    UserNotFoundError,
    UsernameTakenError,
)
from app.domain.user.aggregate import User
from app.utils.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_token,
)

if TYPE_CHECKING:
    from app.domain.user.repository import UserRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)

# Precomputed bcrypt hash of an unreachable password. Used to equalise login
# latency between "user not found" and "user found, wrong password" so an
# attacker can't enumerate valid usernames by timing the response.
_DUMMY_PASSWORD_HASH = hash_password("__timing_equaliser__")


class AuthApplicationService:

    def __init__(
        self,
        user_repo: UserRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._user_repo = user_repo
        self._uow = uow

    def register(self, username: str, password: str) -> tuple[User, str]:
        """Create a new user and issue an access token. Returns (user, token)."""
        with self._uow:
            if self._user_repo.find_by_username(username):
                raise UsernameTakenError("Username already taken")
            user = User.create(username=username, password_hash=hash_password(password))
            self._user_repo.save(user)
            try:
                self._uow.commit()
            except IntegrityError as e:
                # Concurrent duplicate registration: the unique constraint on
                # users.username serialises the race even when the read above
                # missed the other transaction's pending insert.
                raise UsernameTakenError("Username already taken") from e
        token = create_access_token({"sub": user.id})
        return user, token

    def login(self, username: str, password: str) -> tuple[User, str]:
        """Authenticate credentials and issue an access token."""
        user = self._user_repo.find_by_username(username)
        # Always run one bcrypt verify so the "user not found" and "wrong
        # password" branches take the same wall-clock time. Without this,
        # an attacker can enumerate valid usernames via response timing.
        if user is None:
            verify_password(password, _DUMMY_PASSWORD_HASH)
            raise InvalidCredentialsError("Invalid username or password")
        if not verify_password(password, user.password_hash):
            raise InvalidCredentialsError("Invalid username or password")
        token = create_access_token({"sub": user.id})
        return user, token

    def authenticate_token(self, token: str) -> User:
        """Decode a bearer token and return the owning user."""
        payload = decode_token(token)
        if payload is None:
            raise InvalidTokenError("Token 無效或已過期")
        user_id = payload.get("sub")
        if not user_id:
            raise InvalidTokenError("Token 格式錯誤")
        user = self._user_repo.find_by_id(user_id)
        if user is None:
            raise UserNotFoundError("使用者不存在")
        return user
