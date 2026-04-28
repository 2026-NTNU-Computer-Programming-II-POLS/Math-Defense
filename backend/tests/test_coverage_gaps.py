"""Coverage-gap tests targeting findings from the test-coverage audit:

- _get_session stale-path side effects (auto-abandon + 410)
- per-level rank correctness (dense_rank partition_by)
- abuse cases (negative hp clamp, score delta plausibility cap)
- FK-cascade on user deletion
- parametrised SessionStatus × command matrix
"""
from datetime import datetime, timedelta, UTC

import pytest

from app.application.session_service import (
    SessionApplicationService,
    SessionNotFoundError,
)
from app.db.database import get_db
from app.domain.session.aggregate import (
    GameSession as DomainGameSession,
    SessionNotActiveError,
)
from app.domain.value_objects import Level, SessionStatus
from app.infrastructure.persistence.leaderboard_repository import (
    SqlAlchemyLeaderboardRepository,
)
from app.infrastructure.persistence.session_repository import (
    SqlAlchemySessionRepository,
)
from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork
from app.limiter import limiter
from app.main import app
from app.models.game_session import GameSession as GameSessionModel
from app.models.leaderboard import LeaderboardEntry as LeaderboardEntryModel
from app.models.user import User as UserModel


def _register_and_token(client, name):
    res = client.post(
        "/api/auth/register",
        json={"email": f"{name}@test.local", "password": "secret123", "player_name": name, "role": "student"},
    )
    return res.cookies.get("access_token")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _build_service(db):
    return SessionApplicationService(
        session_repo=SqlAlchemySessionRepository(db),
        leaderboard_repo=SqlAlchemyLeaderboardRepository(db),
        uow=SqlAlchemyUnitOfWork(db),
    )


# ── 1. _get_session stale-path side effects ──────────────────────────────────

class TestGetSessionStalePath:
    """The bug being guarded: a stale-but-still-ACTIVE session must be abandoned
    *and committed* before the SessionStaleError propagates, so the next request
    sees ABANDONED rather than ACTIVE again."""

    def _open_db(self):
        """Borrow a DB session from the FastAPI override and ensure cleanup."""
        gen = app.dependency_overrides[get_db]()
        db = next(gen)
        return db, gen

    def test_stale_session_is_persisted_as_abandoned(self, client):
        from sqlalchemy import update

        token = _register_and_token(client, "stale_persists")
        sid = client.post(
            "/api/sessions", json={"star_rating": 1}, headers=_auth(token),
        ).json()["id"]

        # Backdate the session so is_stale becomes True
        db, gen = self._open_db()
        try:
            db.execute(
                update(GameSessionModel)
                .where(GameSessionModel.id == sid)
                .values(started_at=datetime.now(UTC) - timedelta(hours=3)),
            )
            db.commit()
        finally:
            gen.close()

        # First call should hit the stale branch and 410 out
        res = client.patch(
            f"/api/sessions/{sid}",
            json={"gold": 500},
            headers=_auth(token),
        )
        assert res.status_code == 410

        # The session must now be ABANDONED in the DB — not still ACTIVE
        db, gen = self._open_db()
        try:
            row = db.query(GameSessionModel).filter(GameSessionModel.id == sid).one()
            assert row.status == SessionStatus.ABANDONED.value
            assert row.ended_at is not None
        finally:
            gen.close()

        # Second call hits the same code-path: now find_by_id returns ABANDONED;
        # update_progress raises SessionNotActiveError → 409 (not 410 again).
        res2 = client.patch(
            f"/api/sessions/{sid}",
            json={"gold": 500},
            headers=_auth(token),
        )
        assert res2.status_code == 409


# ── 2. per-level rank correctness (dense_rank partition_by) ─────────────────

class TestPerLevelRank:
    """Without partition_by the GET ?level=X path would still report the global rank.
    With it, rank 1 must reset within each level."""

    def test_rank_resets_per_level(self, client):
        # Two users, scores at level 1 and 2 interleaved
        t1 = _register_and_token(client, "rank_u1")
        t2 = _register_and_token(client, "rank_u2")

        def play(token, level, score):
            sid = client.post(
                "/api/sessions", json={"star_rating": level}, headers=_auth(token),
            ).json()["id"]
            client.post(
                f"/api/sessions/{sid}/end",
                json={"score": score, "kills": 1, "waves_survived": 1},
                headers=_auth(token),
            )

        # Level 1: u1=1000 (rank 1), u2=500 (rank 2)
        # Level 2: u1=200  (rank 2), u2=800 (rank 1)
        play(t1, 1, 1000)
        play(t2, 1, 500)
        play(t1, 2, 200)
        play(t2, 2, 800)

        l1 = client.get("/api/leaderboard?level=1").json()["entries"]
        l2 = client.get("/api/leaderboard?level=2").json()["entries"]

        # Each level's top entry must have rank 1 (would be 1 and 3 if global)
        assert l1[0]["rank"] == 1
        assert l1[0]["score"] == 1000
        assert l2[0]["rank"] == 1
        assert l2[0]["score"] == 800

        # And both levels must contain exactly two entries with ranks {1, 2}
        assert sorted(e["rank"] for e in l1) == [1, 2]
        assert sorted(e["rank"] for e in l2) == [1, 2]

    def test_unfiltered_uses_global_rank(self, client):
        """Sanity: omitting ?level=X yields a single global ladder, not partitioned."""
        t1 = _register_and_token(client, "global_u1")
        t2 = _register_and_token(client, "global_u2")

        def play(token, level, score):
            sid = client.post("/api/sessions", json={"star_rating": level}, headers=_auth(token)).json()["id"]
            client.post(
                f"/api/sessions/{sid}/end",
                json={"score": score, "kills": 1, "waves_survived": 1},
                headers=_auth(token),
            )

        play(t1, 1, 1000)
        play(t2, 2, 800)

        entries = client.get("/api/leaderboard").json()["entries"]
        # Global ladder: rank 1 = top score across all levels
        ranks = sorted(e["rank"] for e in entries)
        assert ranks == [1, 2]
        assert entries[0]["score"] == 1000
        assert entries[0]["rank"] == 1


# ── 3. Rate-limiter presence (production config) ────────────────────────────

class TestRateLimiterPresence:
    """The default `client` fixture disables the limiter for tests, so this
    suite re-enables it inside the test to verify the production behaviour."""

    def test_limiter_registered_on_app(self):
        from app.main import app as production_app
        assert production_app.state.limiter is limiter

    def test_create_session_eventually_429s(self, client):
        token = _register_and_token(client, "rl_create")
        limiter.enabled = True
        try:
            limiter.reset()
            statuses = set()
            # Create endpoint cap is 30/minute — make 35 attempts and assert at
            # least one 429 surfaces. Bodies are intentionally invalid so we
            # don't pollute the DB with active sessions; the limiter runs first.
            for _ in range(35):
                res = client.post(
                    "/api/sessions",
                    json={"star_rating": 1},
                    headers=_auth(token),
                )
                statuses.add(res.status_code)
                if 429 in statuses:
                    break
            assert 429 in statuses, f"expected a 429 within 35 attempts, saw {statuses}"
        finally:
            limiter.enabled = False
            limiter.reset()


# ── 4. Abuse cases (negative hp clamp via PATCH; score-delta cap) ───────────

class TestAbuseCases:
    def test_negative_hp_rejected_at_schema(self, client):
        """Pydantic should bounce hp < 0 before it reaches the aggregate."""
        token = _register_and_token(client, "abuse_neg_hp")
        sid = client.post("/api/sessions", json={"star_rating": 1}, headers=_auth(token)).json()["id"]
        res = client.patch(
            f"/api/sessions/{sid}",
            json={"hp": -5},
            headers=_auth(token),
        )
        assert res.status_code == 422

    def test_aggregate_clamps_hp_defense_in_depth(self):
        """If a non-HTTP caller bypassed the schema, the aggregate must still clamp."""
        s = DomainGameSession.create("u-1", Level(1))
        s.update_progress(hp=999)
        assert s.hp == 100  # _MAX_HP
        s.update_progress(hp=-50)  # would never reach here from HTTP, but defensive:
        assert s.hp == 0

    def test_score_delta_above_cap_rejected_via_patch(self, client):
        token = _register_and_token(client, "abuse_score_delta")
        sid = client.post("/api/sessions", json={"star_rating": 1}, headers=_auth(token)).json()["id"]

        # First small bump succeeds
        ok = client.patch(
            f"/api/sessions/{sid}",
            json={"score": 100},
            headers=_auth(token),
        )
        assert ok.status_code == 200

        # Now jump by > 50_000 in a single patch — aggregate should reject
        bad = client.patch(
            f"/api/sessions/{sid}",
            json={"score": 100 + 60_000},
            headers=_auth(token),
        )
        assert bad.status_code == 422

    def test_score_must_not_decrease(self, client):
        token = _register_and_token(client, "abuse_score_dec")
        sid = client.post("/api/sessions", json={"star_rating": 1}, headers=_auth(token)).json()["id"]
        client.patch(f"/api/sessions/{sid}", json={"score": 1000}, headers=_auth(token))
        res = client.patch(
            f"/api/sessions/{sid}",
            json={"score": 500},
            headers=_auth(token),
        )
        assert res.status_code == 422

    def test_end_score_below_in_flight_rejected(self, client):
        token = _register_and_token(client, "abuse_end_lt_score")
        sid = client.post("/api/sessions", json={"star_rating": 1}, headers=_auth(token)).json()["id"]
        client.patch(f"/api/sessions/{sid}", json={"score": 5_000}, headers=_auth(token))
        res = client.post(
            f"/api/sessions/{sid}/end",
            json={"score": 100, "kills": 1, "waves_survived": 1},
            headers=_auth(token),
        )
        assert res.status_code == 422


# ── 5. FK-cascade on user deletion ──────────────────────────────────────────

class TestUserDeletionCascade:
    def test_deleting_user_cascades_sessions_and_nulls_leaderboard_session_id(self, client, session_factory):
        token = _register_and_token(client, "cascade_user")

        sid = client.post("/api/sessions", json={"star_rating": 1}, headers=_auth(token)).json()["id"]
        client.post(
            f"/api/sessions/{sid}/end",
            json={"score": 333, "kills": 1, "waves_survived": 1},
            headers=_auth(token),
        )

        # Sanity: rows exist before deletion
        db = session_factory()
        try:
            user = db.query(UserModel).filter(UserModel.email == "cascade_user@test.local").one()
            assert db.query(GameSessionModel).filter(GameSessionModel.user_id == user.id).count() == 1
            lb_before = db.query(LeaderboardEntryModel).filter(LeaderboardEntryModel.user_id == user.id).all()
            assert len(lb_before) == 1
            assert lb_before[0].session_id == sid

            # Delete the user
            db.delete(user)
            db.commit()
        finally:
            db.close()

        db = session_factory()
        try:
            # game_sessions: ON DELETE CASCADE → row gone
            assert db.query(GameSessionModel).filter(GameSessionModel.id == sid).count() == 0
            # leaderboard.user_id: ON DELETE SET NULL → entry survives anonymised
            # leaderboard.session_id: ON DELETE SET NULL → nulled when game session was cascade-deleted
            lb = db.query(LeaderboardEntryModel).all()
            assert len(lb) == 1
            assert lb[0].user_id is None
            assert lb[0].session_id is None
        finally:
            db.close()


# ── 6. Parametrised SessionStatus × command matrix ──────────────────────────


@pytest.fixture
def matrix_db(db_session):
    """PG session seeded with the user we hang parametrised sessions off."""
    db_session.add(UserModel(
        id="u-matrix", username="u_matrix", email="u_matrix@test.local",
        player_name="u_matrix", role="student", password_hash="x",
    ))
    db_session.commit()
    return db_session


def _seed_session(db, status: SessionStatus) -> str:
    row = GameSessionModel(
        id=f"s-{status.value}",
        user_id="u-matrix",
        star_rating=1,
        status=status.value,
        score=10,  # so a follow-up update can target a higher score
        ended_at=None if status == SessionStatus.ACTIVE else datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    return row.id


@pytest.mark.parametrize("source", list(SessionStatus))
@pytest.mark.parametrize("command", ["update_progress", "complete", "abandon"])
class TestSessionStatusCommandMatrix:
    """For each (source SessionStatus, command), assert the DB-visible outcome
    after commit. ACTIVE is the only mutable state; abandon() is idempotent."""

    def _run_command(self, command, db, sid):
        service = _build_service(db)
        if command == "update_progress":
            service.update_session(sid, "u-matrix", score=500)
        elif command == "complete":
            service.end_session(sid, "u-matrix", score=500, kills=1, waves_survived=1)
        elif command == "abandon":
            service.abandon_session(sid, "u-matrix")

    def test_db_state_after_commit(self, matrix_db, source, command):
        sid = _seed_session(matrix_db, source)
        # Re-bind a fresh service per test (UoW has internal commit flag)
        try:
            self._run_command(command, matrix_db, sid)
            ok = True
        except (SessionNotActiveError, SessionNotFoundError):
            matrix_db.rollback()
            ok = False
        # Read row freshly
        row = (
            matrix_db.query(GameSessionModel)
            .filter(GameSessionModel.id == sid)
            .one()
        )

        if source == SessionStatus.ACTIVE:
            if command == "update_progress":
                assert ok and row.status == SessionStatus.ACTIVE.value
                assert row.score == 500
            elif command == "complete":
                assert ok and row.status == SessionStatus.COMPLETED.value
                assert row.ended_at is not None
            elif command == "abandon":
                assert ok and row.status == SessionStatus.ABANDONED.value
                assert row.ended_at is not None
        else:
            # Non-active source: row must remain in source state
            if command == "abandon":
                # abandon() is a documented no-op on terminal states
                assert ok
                assert row.status == source.value
            elif command == "complete" and source == SessionStatus.COMPLETED:
                # end_session is idempotent on an already-completed session —
                # a retry returns the stored state without mutating the row.
                assert ok
                assert row.status == source.value
                assert row.score == 10
            else:
                # update_progress on non-active, or complete on ABANDONED,
                # must raise without mutating the row.
                assert not ok
                assert row.status == source.value
                assert row.score == 10
