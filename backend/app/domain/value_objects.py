"""Value Objects — 不可變的領域概念，用型別取代原始型別散落"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class SessionStatus(str, Enum):
    """場次狀態 — 取代散落的 "active" / "completed" / "abandoned" 字串"""
    ACTIVE = "active"
    COMPLETED = "completed"
    ABANDONED = "abandoned"


class Level(int):
    """關卡等級 — 限制在 1~4"""
    def __new__(cls, value: int) -> Level:
        if not 1 <= value <= 4:
            raise ValueError(f"關卡需在 1~4 之間，收到 {value}")
        return super().__new__(cls, value)


@dataclass(frozen=True)
class Score:
    """分數 — 不可為負，有上限"""
    value: int

    def __post_init__(self) -> None:
        if not 0 <= self.value <= 9_999_999:
            raise ValueError(f"分數需在 0~9999999 之間，收到 {self.value}")


@dataclass(frozen=True)
class GameResult:
    """遊戲結算結果 — 結束場次時提交的完整資料"""
    score: Score
    kills: int
    waves_survived: int

    def __post_init__(self) -> None:
        if self.kills < 0:
            raise ValueError("擊殺數不可為負")
        if self.waves_survived < 0:
            raise ValueError("存活波數不可為負")
