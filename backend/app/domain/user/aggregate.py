"""User Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC

from app.domain.user.value_objects import Role


class User:
    """
    User aggregate root.

    Invariants:
    1. id is stable once assigned
    2. password_hash stores an already-hashed value; plaintext never reaches
       the domain — hashing is done by the application layer before construction
    3. role is immutable after creation (admin escalation requires a separate flow)
    """

    def __init__(
        self,
        id: str,
        username: str | None,
        email: str,
        player_name: str,
        role: Role,
        password_hash: str,
        avatar_url: str | None = None,
        created_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.username = username
        self.email = email
        self.player_name = player_name
        self.role = role
        self.password_hash = password_hash
        self.avatar_url = avatar_url
        self.created_at = created_at or datetime.now(UTC)

    @classmethod
    def create(
        cls,
        email: str,
        player_name: str,
        role: Role,
        password_hash: str,
        username: str | None = None,
    ) -> User:
        """Factory — assigns a new id. Password is already hashed by the caller."""
        return cls(
            id=str(uuid.uuid4()),
            username=username,
            email=email,
            player_name=player_name,
            role=role,
            password_hash=password_hash,
        )

    @property
    def is_admin(self) -> bool:
        return self.role == Role.ADMIN

    @property
    def is_teacher(self) -> bool:
        return self.role == Role.TEACHER

    @property
    def is_student(self) -> bool:
        return self.role == Role.STUDENT
