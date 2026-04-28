"""Class Aggregate Root"""
from __future__ import annotations

import secrets
import string
import uuid
from datetime import datetime, UTC

from app.domain.class_.errors import NotClassOwnerError


_JOIN_CODE_ALPHABET = string.ascii_uppercase + string.digits
_JOIN_CODE_LENGTH = 6


def _generate_join_code() -> str:
    return "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(_JOIN_CODE_LENGTH))


class Class:
    """
    Classroom aggregate — owned by one teacher, contains student memberships.

    Invariants:
    1. join_code is unique and auto-generated on creation
    2. teacher_id is immutable after creation
    3. Only the owning teacher (or an admin) may mutate the class
    """

    def __init__(
        self,
        id: str,
        name: str,
        teacher_id: str,
        join_code: str,
        created_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.name = name
        self.teacher_id = teacher_id
        self.join_code = join_code
        self.created_at = created_at or datetime.now(UTC)

    @classmethod
    def create(cls, name: str, teacher_id: str) -> Class:
        return cls(
            id=str(uuid.uuid4()),
            name=name,
            teacher_id=teacher_id,
            join_code=_generate_join_code(),
        )

    def is_owned_by(self, user_id: str) -> bool:
        return self.teacher_id == user_id

    def verify_owner(self, user_id: str) -> None:
        """Raise NotClassOwnerError if user_id is not the owning teacher."""
        if not self.is_owned_by(user_id):
            raise NotClassOwnerError("You do not own this class")

    def regenerate_join_code(self) -> str:
        self.join_code = _generate_join_code()
        return self.join_code


class ClassMembership:

    def __init__(
        self,
        id: str,
        class_id: str,
        student_id: str,
        joined_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.class_id = class_id
        self.student_id = student_id
        self.joined_at = joined_at or datetime.now(UTC)

    @classmethod
    def create(cls, class_id: str, student_id: str) -> ClassMembership:
        return cls(
            id=str(uuid.uuid4()),
            class_id=class_id,
            student_id=student_id,
        )
