"""GameSession Aggregate Root — encapsulates all session invariants and state transitions"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

from app.config import settings
from app.domain.constraints import GOLD_MAX, HP_MAX, MAX_SCORE_DELTA, MAX_WAVE
from app.domain.errors import InvalidStatusTransitionError, SessionNotActiveError
from app.domain.value_objects import SessionStatus, Level, GameResult
from app.domain.session.events import (
    SessionCreated,
    SessionCompleted,
    SessionAbandoned,
    SessionUpdated,
)
from app.shared_constants import INITIAL_GOLD, INITIAL_HP


def _stale_cutoff() -> timedelta:
    # Read at call time so tests / runtime overrides of the setting take effect.
    return timedelta(hours=settings.session_stale_cutoff_hours)


# Kept for backwards compatibility with callers that imported the constant.
STALE_CUTOFF = _stale_cutoff()

# Bounds live in domain.constraints; the aggregate enforces game rules
# (hp can't exceed maxHp, score can't decrease, wave can't jump past the max).

# Valid state transition table
_ALLOWED_TRANSITIONS: dict[SessionStatus, set[SessionStatus]] = {
    SessionStatus.ACTIVE: {SessionStatus.COMPLETED, SessionStatus.ABANDONED},
    SessionStatus.COMPLETED: set(),   # 終態
    SessionStatus.ABANDONED: set(),   # 終態
}


class GameSession:
    """
    GameSession aggregate root.

    Invariants:
    1. Only ACTIVE sessions can be updated
    2. Only ACTIVE sessions can be completed
    3. Status transitions must follow the valid transition table
    4. Completing a session emits the SessionCompleted domain event
    """

    def __init__(
        self,
        id: str,
        user_id: str,
        level: Level,
        status: SessionStatus = SessionStatus.ACTIVE,
        current_wave: int = 0,
        gold: int = INITIAL_GOLD,
        hp: int = INITIAL_HP,
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
        """Factory method — creates a new ACTIVE session"""
        session = cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            level=level,
        )
        session._events.append(
            SessionCreated(session_id=session.id, user_id=user_id, level=int(level))
        )
        return session

    # ── Status queries ──

    @property
    def is_active(self) -> bool:
        return self.status == SessionStatus.ACTIVE

    @property
    def is_stale(self) -> bool:
        """Session still active after 2 hours → considered stale"""
        if not self.is_active:
            return False
        now = datetime.now(UTC)
        started = self.started_at
        # SQLite returns naive datetime; normalize to aware before comparing
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        return now - started > _stale_cutoff()

    # ── Commands (state-mutating methods) ──

    def update_progress(
        self,
        current_wave: int | None = None,
        gold: int | None = None,
        hp: int | None = None,
        score: int | None = None,
    ) -> None:
        """Update game progress — only allowed in ACTIVE status.

        Defense-in-depth: clamp each field to its physical range and reject
        score regressions / large deltas that signal a tampered client.
        """
        self._assert_active("Cannot update a non-active session")
        if current_wave is not None:
            if current_wave < self.current_wave:
                raise ValueError("current_wave must not decrease")
            self.current_wave = max(0, min(current_wave, MAX_WAVE))
        if gold is not None:
            self.gold = max(0, min(gold, GOLD_MAX))
        if hp is not None:
            self.hp = max(0, min(hp, HP_MAX))
        if score is not None:
            if score < self.score:
                raise ValueError("score must not decrease")
            if score - self.score > MAX_SCORE_DELTA:
                raise ValueError("score delta exceeds plausibility cap")
            self.score = score
        self._events.append(SessionUpdated(session_id=self.id))

    def complete(self, result: GameResult) -> None:
        """End session — transition to COMPLETED and emit domain event"""
        self._assert_active("Session already ended, cannot resubmit")
        # Reject end-payload scores that wildly exceed the most recent in-flight score
        if result.score.value < self.score:
            raise ValueError("final score must not be less than last reported score")
        if result.score.value - self.score > MAX_SCORE_DELTA:
            raise ValueError("final score delta exceeds plausibility cap")
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
        """Abandon session — idempotent (no-op if already ended)"""
        if not self.is_active:
            return
        self._transition_to(SessionStatus.ABANDONED)
        self.ended_at = datetime.now(UTC)
        self._events.append(SessionAbandoned(session_id=self.id))

    # ── Domain events ──

    def collect_events(self) -> list:
        """Return a snapshot of events (non-destructive); call clear_events() after successful commit"""
        return self._events.copy()

    def clear_events(self) -> None:
        """Call after UoW commit succeeds; clears processed events"""
        self._events.clear()

    # ── Internal ──

    def _assert_active(self, message: str) -> None:
        if not self.is_active:
            raise SessionNotActiveError(message)

    def _transition_to(self, new_status: SessionStatus) -> None:
        allowed = _ALLOWED_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise InvalidStatusTransitionError(
                f"Invalid status transition: {self.status.value} → {new_status.value}"
            )
        self.status = new_status


# Re-export for backward compatibility with callers that import from aggregate.
__all__ = [
    "GameSession",
    "SessionNotActiveError",
    "InvalidStatusTransitionError",
]
