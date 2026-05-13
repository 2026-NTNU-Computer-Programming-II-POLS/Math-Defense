"""Repository-layer tests for SqlAlchemySessionRepository.

These complement the aggregate unit tests (test_session_aggregate.py) and the
HTTP-layer tests (test_game_session.py) by exercising query predicates that
have no obvious surrogate at the other layers — e.g. the Star-5 unlock
predicate added by Pedagogical_Backlog_Spec.md §5.
"""
from __future__ import annotations

from app.domain.session.aggregate import GameSession
from app.domain.user.aggregate import User
from app.domain.user.value_objects import Role
from app.domain.value_objects import Level
from app.infrastructure.persistence.session_repository import (
    SqlAlchemySessionRepository,
)
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository


def _make_user(db_session, name: str) -> User:
    user = User.create(
        email=f"{name}@test.local",
        player_name=name,
        role=Role.STUDENT,
        password_hash="x",
    )
    SqlAlchemyUserRepository(db_session).save(user)
    db_session.flush()
    return user


class TestHasCorrectIaSession:
    """Star-5 unlock predicate (spec §5.2 / §5.4)."""

    def test_returns_false_for_new_user(self, db_session):
        user = _make_user(db_session, "ia_new")
        repo = SqlAlchemySessionRepository(db_session)
        assert repo.has_correct_ia_session(user.id) is False

    def test_returns_false_when_only_ia_incorrect_sessions_exist(self, db_session):
        user = _make_user(db_session, "ia_wrong")
        repo = SqlAlchemySessionRepository(db_session)
        s = GameSession.create(user.id, Level(1), initial_answer=False)
        repo.save(s)
        db_session.flush()
        assert repo.has_correct_ia_session(user.id) is False

    def test_returns_true_after_ia_correct_session(self, db_session):
        user = _make_user(db_session, "ia_ok")
        repo = SqlAlchemySessionRepository(db_session)
        s = GameSession.create(user.id, Level(1), initial_answer=True)
        repo.save(s)
        db_session.flush()
        assert repo.has_correct_ia_session(user.id) is True

    def test_isolation_across_users(self, db_session):
        a = _make_user(db_session, "ia_a")
        b = _make_user(db_session, "ia_b")
        repo = SqlAlchemySessionRepository(db_session)
        repo.save(GameSession.create(a.id, Level(1), initial_answer=True))
        db_session.flush()
        assert repo.has_correct_ia_session(a.id) is True
        assert repo.has_correct_ia_session(b.id) is False
