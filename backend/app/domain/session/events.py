"""GameSession Domain Events — 場次生命週期中的重要狀態變化"""
from dataclasses import dataclass


@dataclass(frozen=True)
class SessionCreated:
    session_id: str
    user_id: str
    level: int


@dataclass(frozen=True)
class SessionUpdated:
    session_id: str


@dataclass(frozen=True)
class SessionCompleted:
    """場次完成 — Leaderboard BC 消費此事件以自動建立排行榜條目"""
    session_id: str
    user_id: str
    level: int
    score: int
    kills: int
    waves_survived: int


@dataclass(frozen=True)
class SessionAbandoned:
    session_id: str
