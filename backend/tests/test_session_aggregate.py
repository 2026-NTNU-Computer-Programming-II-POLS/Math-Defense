"""GameSession Aggregate 單元測試 — 純 Python，不需要資料庫"""
import pytest
from datetime import datetime, timedelta, UTC

from app.domain.value_objects import SessionStatus, Level, Score, GameResult
from app.domain.session.aggregate import (
    GameSession,
    SessionNotActiveError,
    InvalidStatusTransitionError,
)
from app.domain.session.events import (
    SessionCreated,
    SessionCompleted,
    SessionAbandoned,
    SessionUpdated,
)


# ── 工廠方法 ──

class TestCreate:
    def test_create_returns_active_session(self):
        session = GameSession.create("user-1", Level(1))
        assert session.is_active
        assert session.user_id == "user-1"
        assert session.level == 1
        assert session.status == SessionStatus.ACTIVE
        assert session.current_wave == 0
        assert session.gold == 200
        assert session.hp == 20
        assert session.score == 0

    def test_create_emits_session_created(self):
        session = GameSession.create("user-1", Level(2))
        events = session.collect_events()
        assert len(events) == 1
        assert isinstance(events[0], SessionCreated)
        assert events[0].user_id == "user-1"
        assert events[0].level == 2

    def test_collect_events_is_non_destructive(self):
        session = GameSession.create("user-1", Level(1))
        first = session.collect_events()
        second = session.collect_events()
        assert first == second
        assert len(first) == 1

    def test_clear_events_empties_list(self):
        session = GameSession.create("user-1", Level(1))
        session.clear_events()
        assert session.collect_events() == []


# ── 更新進度 ──

class TestUpdateProgress:
    def test_update_all_fields(self):
        session = GameSession.create("user-1", Level(1))
        session.clear_events()

        session.update_progress(current_wave=3, gold=150, hp=15, score=100)
        assert session.current_wave == 3
        assert session.gold == 150
        assert session.hp == 15
        assert session.score == 100

    def test_update_partial_fields(self):
        session = GameSession.create("user-1", Level(1))
        session.update_progress(gold=300)
        assert session.gold == 300
        assert session.hp == 20  # unchanged

    def test_update_emits_event(self):
        session = GameSession.create("user-1", Level(1))
        session.clear_events()

        session.update_progress(score=50)
        events = session.collect_events()
        assert len(events) == 1
        assert isinstance(events[0], SessionUpdated)

    def test_update_completed_session_raises(self):
        session = GameSession.create("user-1", Level(1))
        session.complete(GameResult(Score(100), kills=5, waves_survived=2))

        with pytest.raises(SessionNotActiveError):
            session.update_progress(gold=999)

    def test_update_abandoned_session_raises(self):
        session = GameSession.create("user-1", Level(1))
        session.abandon()

        with pytest.raises(SessionNotActiveError):
            session.update_progress(score=50)


# ── 完成場次 ──

class TestComplete:
    def test_complete_transitions_to_completed(self):
        session = GameSession.create("user-1", Level(1))
        result = GameResult(Score(500), kills=10, waves_survived=3)
        session.complete(result)

        assert session.status == SessionStatus.COMPLETED
        assert session.score == 500
        assert session.ended_at is not None
        assert not session.is_active

    def test_complete_emits_session_completed(self):
        session = GameSession.create("user-1", Level(2))
        session.clear_events()

        result = GameResult(Score(500), kills=10, waves_survived=3)
        session.complete(result)

        events = session.collect_events()
        assert len(events) == 1
        assert isinstance(events[0], SessionCompleted)
        assert events[0].user_id == "user-1"
        assert events[0].level == 2
        assert events[0].score == 500
        assert events[0].kills == 10
        assert events[0].waves_survived == 3

    def test_complete_twice_raises(self):
        session = GameSession.create("user-1", Level(1))
        session.complete(GameResult(Score(100), 5, 2))

        with pytest.raises(SessionNotActiveError, match="已結束"):
            session.complete(GameResult(Score(200), 10, 4))

    def test_complete_abandoned_session_raises(self):
        session = GameSession.create("user-1", Level(1))
        session.abandon()

        with pytest.raises(SessionNotActiveError):
            session.complete(GameResult(Score(100), 5, 2))


# ── 放棄場次 ──

class TestAbandon:
    def test_abandon_transitions_to_abandoned(self):
        session = GameSession.create("user-1", Level(1))
        session.abandon()

        assert session.status == SessionStatus.ABANDONED
        assert session.ended_at is not None

    def test_abandon_emits_event(self):
        session = GameSession.create("user-1", Level(1))
        session.clear_events()

        session.abandon()
        events = session.collect_events()
        assert len(events) == 1
        assert isinstance(events[0], SessionAbandoned)

    def test_abandon_idempotent_on_completed(self):
        session = GameSession.create("user-1", Level(1))
        session.complete(GameResult(Score(100), 5, 2))
        session.clear_events()

        session.abandon()  # should be no-op
        assert session.status == SessionStatus.COMPLETED
        assert session.collect_events() == []

    def test_abandon_idempotent_on_abandoned(self):
        session = GameSession.create("user-1", Level(1))
        session.abandon()
        session.clear_events()

        session.abandon()  # should be no-op
        assert session.collect_events() == []


# ── 過期判定 ──

class TestIsStale:
    def test_fresh_session_not_stale(self):
        session = GameSession.create("user-1", Level(1))
        assert not session.is_stale

    def test_old_session_is_stale(self):
        session = GameSession(
            id="s-1",
            user_id="user-1",
            level=Level(1),
            started_at=datetime.now(UTC) - timedelta(hours=3),
        )
        assert session.is_stale

    def test_completed_session_not_stale(self):
        session = GameSession(
            id="s-1",
            user_id="user-1",
            level=Level(1),
            status=SessionStatus.COMPLETED,
            started_at=datetime.now(UTC) - timedelta(hours=3),
        )
        assert not session.is_stale


# ── 狀態轉換守衛 ──

class TestStatusTransitions:
    def test_completed_to_abandoned_raises(self):
        session = GameSession(
            id="s-1", user_id="u-1", level=Level(1),
            status=SessionStatus.COMPLETED,
        )
        session.abandon()  # idempotent no-op, should not raise

    def test_abandoned_to_completed_raises(self):
        session = GameSession(
            id="s-1", user_id="u-1", level=Level(1),
            status=SessionStatus.ABANDONED,
        )
        with pytest.raises(SessionNotActiveError):
            session.complete(GameResult(Score(100), 5, 2))
