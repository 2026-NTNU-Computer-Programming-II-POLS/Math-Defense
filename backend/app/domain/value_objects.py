"""Value Objects — immutable domain concepts; replace scattered primitive types"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from app.domain.errors import DomainValueError
from app.domain.constraints import (
    LEVEL_MAX,
    LEVEL_MIN,
    SCORE_MAX,
    SCORE_MIN,
)


class SessionStatus(str, Enum):
    """Session status — replaces scattered "active" / "completed" / "abandoned" string literals"""
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class Level(int):
    """Level — constrained per domain.constraints.LEVEL_RANGE"""
    def __new__(cls, value: int) -> Level:
        if not LEVEL_MIN <= value <= LEVEL_MAX:
            raise DomainValueError(f"Level must be between {LEVEL_MIN} and {LEVEL_MAX}, got {value}")
        return super().__new__(cls, value)


@dataclass(frozen=True)
class Score:
    """Score — constrained per domain.constraints.SCORE_RANGE"""
    value: int

    def __post_init__(self) -> None:
        if not SCORE_MIN <= self.value <= SCORE_MAX:
            raise DomainValueError(f"Score must be between {SCORE_MIN} and {SCORE_MAX}, got {self.value}")


@dataclass(frozen=True)
class GameResult:
    """Game result — full data submitted when a session ends"""
    score: Score
    kills: int
    waves_survived: int

    def __post_init__(self) -> None:
        if self.kills < 0:
            raise DomainValueError("Kills must not be negative")
        if self.waves_survived < 0:
            raise DomainValueError("Waves survived must not be negative")
