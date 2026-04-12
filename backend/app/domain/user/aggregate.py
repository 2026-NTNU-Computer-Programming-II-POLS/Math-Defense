"""User Aggregate Root"""
from __future__ import annotations

import uuid
from datetime import datetime, UTC


class User:
    """
    User aggregate root.

    Invariants:
    1. id is stable once assigned
    2. password_hash stores an already-hashed value; plaintext never reaches
       the domain — hashing is done by the application layer before construction
    """

    def __init__(
        self,
        id: str,
        username: str,
        password_hash: str,
        created_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.created_at = created_at or datetime.now(UTC)

    @classmethod
    def create(cls, username: str, password_hash: str) -> User:
        """Factory — assigns a new id. Password is already hashed by the caller."""
        return cls(
            id=str(uuid.uuid4()),
            username=username,
            password_hash=password_hash,
        )
