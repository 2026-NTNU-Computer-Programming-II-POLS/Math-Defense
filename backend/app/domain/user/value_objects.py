"""User-bounded value objects"""
from __future__ import annotations

import enum
import re

from app.domain.user.constraints import EMAIL_MAX_LENGTH


class Role(str, enum.Enum):
    ADMIN = "admin"
    TEACHER = "teacher"
    STUDENT = "student"


_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")


class Email:
    __slots__ = ("_value",)

    def __init__(self, value: str) -> None:
        normalised = value.strip().lower()
        if not normalised or len(normalised) > EMAIL_MAX_LENGTH:
            raise ValueError(f"Email must be 1-{EMAIL_MAX_LENGTH} characters")
        if not _EMAIL_RE.match(normalised):
            raise ValueError(f"Invalid email format: {value}")
        self._value = normalised

    @property
    def value(self) -> str:
        return self._value

    def __str__(self) -> str:
        return self._value

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Email):
            return self._value == other._value
        return NotImplemented

    def __hash__(self) -> int:
        return hash(self._value)
