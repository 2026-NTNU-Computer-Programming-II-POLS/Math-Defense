"""GameSession Aggregate Root — 封裝場次的所有不變量與狀態轉換"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

from app.domain.value_objects import SessionStatus, Level, GameResult
from app.domain.session.events import (
    SessionCreated,
    SessionCompleted,
    SessionAbandoned,
    SessionUpdated,
)

STALE_CUTOFF = timedelta(hours=2)

# 合法的狀態轉換表
_ALLOWED_TRANSITIONS: dict[SessionStatus, set[SessionStatus]] = {
    SessionStatus.ACTIVE: {SessionStatus.COMPLETED, SessionStatus.ABANDONED},
    SessionStatus.COMPLETED: set(),   # 終態
    SessionStatus.ABANDONED: set(),   # 終態
}


class GameSession:
    """
    GameSession 聚合根。

    不變量：
    1. 只有 ACTIVE 的場次可以被更新
    2. 只有 ACTIVE 的場次可以被結束（轉為 COMPLETED）
    3. 狀態轉換必須遵循合法轉換表
    4. 結束場次時產生 SessionCompleted 領域事件
    """

    def __init__(
        self,
        id: str,
        user_id: str,
        level: Level,
        status: SessionStatus = SessionStatus.ACTIVE,
        current_wave: int = 0,
        gold: int = 200,
        hp: int = 20,
        score: int = 0,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.user_id = user_id
        self.level = level
        self.status = status
        self.current_wave = current_wave
        self.gold = gold
        self.hp = hp
        self.score = score
        self.started_at = started_at or datetime.now(UTC)
        self.ended_at = ended_at
        self._events: list = []

    @classmethod
    def create(cls, user_id: str, level: Level) -> GameSession:
        """工廠方法 — 建立新的 ACTIVE 場次"""
        session = cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            level=level,
        )
        session._events.append(
            SessionCreated(session_id=session.id, user_id=user_id, level=int(level))
        )
        return session

    # ── 狀態查詢 ──

    @property
    def is_active(self) -> bool:
        return self.status == SessionStatus.ACTIVE

    @property
    def is_stale(self) -> bool:
        """超過 2 小時仍為 active → 視為過期"""
        if not self.is_active:
            return False
        return datetime.now(UTC) - self.started_at > STALE_CUTOFF

    # ── 指令（改變狀態的方法） ──

    def update_progress(
        self,
        current_wave: int | None = None,
        gold: int | None = None,
        hp: int | None = None,
        score: int | None = None,
    ) -> None:
        """更新遊戲進度 — 僅限 ACTIVE 狀態"""
        self._assert_active("無法更新已結束的場次")
        if current_wave is not None:
            self.current_wave = current_wave
        if gold is not None:
            self.gold = gold
        if hp is not None:
            self.hp = hp
        if score is not None:
            self.score = score
        self._events.append(SessionUpdated(session_id=self.id))

    def complete(self, result: GameResult) -> None:
        """結束場次 — 轉為 COMPLETED，產生領域事件"""
        self._assert_active("場次已結束，無法重複提交")
        self._transition_to(SessionStatus.COMPLETED)
        self.score = result.score.value
        self.ended_at = datetime.now(UTC)
        self._events.append(
            SessionCompleted(
                session_id=self.id,
                user_id=self.user_id,
                level=int(self.level),
                score=result.score.value,
                kills=result.kills,
                waves_survived=result.waves_survived,
            )
        )

    def abandon(self) -> None:
        """放棄場次 — 冪等（已結束則 no-op）"""
        if not self.is_active:
            return
        self._transition_to(SessionStatus.ABANDONED)
        self.ended_at = datetime.now(UTC)
        self._events.append(SessionAbandoned(session_id=self.id))

    # ── 領域事件 ──

    def collect_events(self) -> list:
        """回傳事件的快照（非破壞性），commit 成功後再呼叫 clear_events()"""
        return self._events.copy()

    def clear_events(self) -> None:
        """在 UoW commit 成功後呼叫，清除已處理的事件"""
        self._events.clear()

    # ── 內部 ──

    def _assert_active(self, message: str) -> None:
        if not self.is_active:
            raise SessionNotActiveError(message)

    def _transition_to(self, new_status: SessionStatus) -> None:
        allowed = _ALLOWED_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise InvalidStatusTransitionError(
                f"不合法的狀態轉換：{self.status.value} → {new_status.value}"
            )
        self.status = new_status


class SessionNotActiveError(Exception):
    """場次不在 ACTIVE 狀態"""


class InvalidStatusTransitionError(Exception):
    """不合法的狀態轉換"""
