"""UserRepository — abstract interface (Protocol), no SQLAlchemy dependency"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.user.aggregate import User


@runtime_checkable
class UserRepository(Protocol):
    def find_by_username(self, username: str) -> User | None: ...

    def find_by_id(self, user_id: str) -> User | None: ...

    def save(self, user: User) -> None: ...
