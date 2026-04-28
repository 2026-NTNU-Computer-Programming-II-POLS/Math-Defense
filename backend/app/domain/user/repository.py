"""UserRepository — abstract interface (Protocol), no SQLAlchemy dependency"""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role


@runtime_checkable
class UserRepository(Protocol):
    def find_by_username(self, username: str) -> User | None: ...

    def find_by_email(self, email: str) -> User | None: ...

    def find_by_id(self, user_id: str) -> User | None: ...

    def find_by_role(self, role: Role) -> list[User]: ...

    def save(self, user: User) -> None: ...
