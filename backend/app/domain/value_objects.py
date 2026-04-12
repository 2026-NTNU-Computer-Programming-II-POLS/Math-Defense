"""Value Objects — immutable domain concepts; replace scattered primitive types"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class SessionStatus(str, Enum):
    """Session status — replaces scattered "active" / "completed" / "abandoned" string literals"""
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class Level(int):
    """Level — constrained to values 1 through 4"""
    def __new__(cls, value: int) -> Level:
        if not 1 <= value <= 4:
            raise ValueError(f"Level must be between 1 and 4, got {value}")
        return super().__new__(cls, value)


@dataclass(frozen=True)
class Score:
    """Score — must be non-negative and within the allowed upper bound"""
    value: int

    def __post_init__(self) -> None:
        if not 0 <= self.value <= 9_999_999:
            raise ValueError(f"Score must be between 0 and 9999999, got {self.value}")


@dataclass(frozen=True)
class GameResult:
    """Game result — full data submitted when a session ends"""
    score: Score
    kills: int
    waves_survived: int

    def __post_init__(self) -> None:
        if self.kills < 0:
            raise ValueError("Kills must not be negative")
        if self.waves_survived < 0:
            raise ValueError("Waves survived must not be negative")
