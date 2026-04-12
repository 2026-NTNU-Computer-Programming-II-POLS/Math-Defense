"""SessionApplicationService — Orchestrates GameSession Use Cases"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.value_objects import Level, Score, GameResult, SessionStatus
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.leaderboard.aggregate import LeaderboardEntry

if TYPE_CHECKING:
    from app.domain.session.repository import GameSessionRepository
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)

# Name of the partial-unique index guaranteeing at most one ACTIVE session per user.
# Keep in sync with app/models/game_session.py.
_ACTIVE_SESSION_UNIQUE_INDEX = "uq_one_active_per_user"


class SessionApplicationService:
    """
    Coordinates session creation, updates, and termination.
    Consumes SessionCompleted events to auto-create leaderboard entries.
    """

    def __init__(
        self,
        session_repo: GameSessionRepository,
        leaderboard_repo: LeaderboardRepository,
        uow: SqlAlchemyUnitOfWork,
    ) -> None:
        self._session_repo = session_repo
        self._leaderboard_repo = leaderboard_repo
        self._uow = uow

    def create_session(self, user_id: str, level: int) -> GameSession:
        # Two concurrent creates can both pass find_active_by_user (SQLite ignores FOR UPDATE),
        # then collide on the unique partial index. Retry once after abandoning the row that won.
        for attempt in range(2):
            try:
                return self._create_session_once(user_id, level)
            except IntegrityError as e:
                if attempt == 1 or not _is_active_session_conflict(e):
                    raise
                logger.info("create_session race: retrying after abandoning concurrent active session user=%s", user_id)
        raise RuntimeError("unreachable")

    def _create_session_once(self, user_id: str, level: int) -> GameSession:
        with self._uow:
            # 1. Abandon stale sessions
            stale = self._session_repo.find_stale_sessions(user_id)
            for s in stale:
                s.abandon()
            self._session_repo.save_all(stale)

            # 2. Abandon existing active session (one per user limit)
            existing = self._session_repo.find_active_by_user(user_id)
            if existing:
                existing.abandon()
                self._session_repo.save(existing)

            # 3. Create new session
            session = GameSession.create(user_id, Level(level))
            self._session_repo.save(session)
            self._uow.commit()
            return session

    def update_session(
        self,
        session_id: str,
        user_id: str,
        current_wave: int | None = None,
        gold: int | None = None,
        hp: int | None = None,
        score: int | None = None,
    ) -> GameSession:
        with self._uow:
            session = self._get_session(session_id, user_id)
            session.update_progress(
                current_wave=current_wave,
                gold=gold,
                hp=hp,
                score=score,
            )
            self._session_repo.save(session)
            self._uow.commit()
            return session

    def end_session(
        self,
        session_id: str,
        user_id: str,
        score: int,
        kills: int,
        waves_survived: int,
    ) -> GameSession:
        with self._uow:
            session = self._session_repo.find_by_id(session_id, user_id)
            if not session:
                raise SessionNotFoundError("Session not found")
            # Idempotent retry: if the session is already completed, return the
            # stored state as-is. Clients retrying after a timeout shouldn't have
            # to special-case 409. (ABANDONED falls through to session.complete
            # below, which surfaces as 409 — that's a different scenario.)
            if session.status == SessionStatus.COMPLETED:
                return session
            if session.is_stale:
                session.abandon()
                self._session_repo.save(session)
                self._uow.commit()
                raise SessionStaleError(
                    "Session timed out (over 2 hours) and was automatically abandoned"
                )
            result = GameResult(
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
            )
            session.complete(result)
            self._session_repo.save(session)

            # Snapshot and clear events *before* commit so the aggregate can't
            # re-emit if anything post-commit raises (logger, telemetry, etc.).
            # The leaderboard insert below is part of the same UoW, so if commit
            # fails everything rolls back atomically — the cleared in-memory list
            # is discarded with the aggregate when this request ends.
            pending_events = session.collect_events()
            session.clear_events()
            for event in pending_events:
                if isinstance(event, SessionCompleted):
                    self._handle_session_completed(event)

            self._uow.commit()
            logger.info(
                "Session ended: session=%s user=%s score=%d",
                session.id, user_id, score,
            )
            return session

    def get_active_for_user(self, user_id: str) -> GameSession | None:
        """Return the caller's active session, if any.

        Runs inside a UoW so an expired active session can be auto-abandoned
        and that cleanup persists — future service-level rules (tenant
        scoping, hide abandoned) attach here rather than in the router.
        """
        with self._uow:
            session = self._session_repo.find_active_by_user(user_id)
            if session is None:
                return None
            if session.is_stale:
                session.abandon()
                self._session_repo.save(session)
                self._uow.commit()
                return None
            return session

    def abandon_session(self, session_id: str, user_id: str) -> GameSession:
        """Abandon an active session on the owner's explicit request.

        Used by the frontend to clean up an orphan active session discovered
        at mount time (e.g. after a rapid LEVEL_START race left a server-side
        session whose id was never surfaced client-side). Idempotent: calling
        abandon on an already-ended session is a no-op.
        """
        with self._uow:
            session = self._session_repo.find_by_id(session_id, user_id)
            if not session:
                raise SessionNotFoundError("Session not found")
            session.abandon()
            self._session_repo.save(session)
            self._uow.commit()
            return session

    def _handle_session_completed(self, event: SessionCompleted) -> None:
        """Handle session completed event — auto-create leaderboard entry (idempotent)"""
        existing = self._leaderboard_repo.find_by_session_id(event.session_id)
        if existing:
            return
        entry = LeaderboardEntry.create_from_session(
            user_id=event.user_id,
            level=event.level,
            score=event.score,
            kills=event.kills,
            waves_survived=event.waves_survived,
            session_id=event.session_id,
        )
        self._leaderboard_repo.save(entry)

    def _get_session(self, session_id: str, user_id: str) -> GameSession:
        session = self._session_repo.find_by_id(session_id, user_id)
        if not session:
            raise SessionNotFoundError("Session not found")
        # Force timeout: stale active session is automatically abandoned.
        # Commit before raising so the surrounding UoW.__exit__ cannot roll the abandon back.
        if session.is_stale:
            session.abandon()
            self._session_repo.save(session)
            self._uow.commit()
            raise SessionStaleError("Session timed out (over 2 hours) and was automatically abandoned")
        return session


class SessionNotFoundError(Exception):
    pass


class SessionStaleError(Exception):
    """Session has timed out"""
    pass


def _is_active_session_conflict(err: IntegrityError) -> bool:
    """Return True iff err was raised by the one-active-session-per-user unique index.

    We don't want to blindly retry on any IntegrityError — FK, check, or unrelated
    unique violations indicate a real bug and must surface. We look at the driver
    exception text (portable across SQLite/Postgres) for the index name.
    """
    orig = getattr(err, "orig", None)
    if orig is None:
        return False
    # Postgres: psycopg2 exposes .diag.constraint_name; fall through to string match otherwise.
    diag = getattr(orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None) if diag is not None else None
    if constraint == _ACTIVE_SESSION_UNIQUE_INDEX:
        return True
    return _ACTIVE_SESSION_UNIQUE_INDEX in str(orig)
