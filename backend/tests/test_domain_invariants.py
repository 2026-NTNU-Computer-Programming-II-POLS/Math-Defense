"""Pure-domain invariant tests: LeaderboardEntry guards + repo protocol conformance.

These cover findings D-4 (anemic leaderboard aggregate) and D-7 (Protocol
conformance: a mock omitting required methods would previously type-check).
"""
from __future__ import annotations

import pytest

from app.domain.errors import DomainValueError
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.leaderboard.repository import LeaderboardRepository
from app.domain.session.repository import GameSessionRepository
from app.domain.user.repository import UserRepository
from app.domain.value_objects import Level, Score
from app.infrastructure.persistence.leaderboard_repository import (
    SqlAlchemyLeaderboardRepository,
)
from app.infrastructure.persistence.session_repository import (
    SqlAlchemySessionRepository,
)
from app.infrastructure.persistence.user_repository import SqlAlchemyUserRepository


# ── D-4: LeaderboardEntry invariants ──────────────────────────────────────────

class TestLeaderboardEntryInvariants:
    def test_negative_kills_rejected(self):
        with pytest.raises(DomainValueError):
            LeaderboardEntry.create_from_session(
                user_id="u-1", level=1, score=100,
                kills=-1, waves_survived=3, session_id="s-1",
            )

    def test_negative_waves_rejected(self):
        with pytest.raises(DomainValueError):
            LeaderboardEntry.create_from_session(
                user_id="u-1", level=1, score=100,
                kills=5, waves_survived=-2, session_id="s-1",
            )

    def test_zero_kills_waves_allowed(self):
        entry = LeaderboardEntry.create_from_session(
            user_id="u-1", level=1, score=0,
            kills=0, waves_survived=0, session_id="s-1",
        )
        assert entry.kills == 0
        assert entry.waves_survived == 0

    def test_direct_constructor_also_guarded(self):
        with pytest.raises(DomainValueError):
            LeaderboardEntry(
                id="e-1", user_id="u-1", level=Level(1), score=Score(50),
                kills=-5, waves_survived=1, session_id="s-1",
            )


# ── D-7: Runtime-checkable protocol conformance ──────────────────────────────

class TestRepositoryProtocolConformance:
    """Instances of concrete repositories must satisfy the Protocol at runtime,
    and a stub missing methods must NOT be accepted. Guards against the Protocol
    drift flagged in D-7."""

    def test_session_repo_conforms(self):
        repo = SqlAlchemySessionRepository(db=None)  # db unused for isinstance check
        assert isinstance(repo, GameSessionRepository)

    def test_leaderboard_repo_conforms(self):
        repo = SqlAlchemyLeaderboardRepository(db=None)
        assert isinstance(repo, LeaderboardRepository)

    def test_user_repo_conforms(self):
        repo = SqlAlchemyUserRepository(db=None)
        assert isinstance(repo, UserRepository)

    def test_incomplete_session_repo_rejected(self):
        class PartialRepo:
            def find_by_id(self, session_id, user_id): ...
            # missing: find_active_by_user, find_stale_sessions, save, save_all,
            #          find_by_id_for_update
        assert not isinstance(PartialRepo(), GameSessionRepository)

    def test_incomplete_leaderboard_repo_rejected(self):
        class PartialRepo:
            def find_by_session_id(self, session_id): ...
            # missing: save, query_ranked_global, query_ranked_by_level
        assert not isinstance(PartialRepo(), LeaderboardRepository)
