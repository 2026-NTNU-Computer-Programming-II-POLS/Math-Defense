"""SessionApplicationService — Orchestrates GameSession Use Cases"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError

from app.domain.value_objects import Level, Score, GameResult
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.leaderboard.aggregate import LeaderboardEntry

if TYPE_CHECKING:
    from app.domain.session.repository import GameSessionRepository
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.infrastructure.unit_of_work import SqlAlchemyUnitOfWork

logger = logging.getLogger(__name__)


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
            except IntegrityError:
                if attempt == 1:
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
            session = self._get_session(session_id, user_id)
            result = GameResult(
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
            )
            session.complete(result)
            self._session_repo.save(session)

            # Consume SessionCompleted event → auto-create leaderboard entry
            for event in session.collect_events():
                if isinstance(event, SessionCompleted):
                    self._handle_session_completed(event)

            self._uow.commit()
            session.clear_events()  # clear events only after successful commit
            logger.info(
                "Session ended: session=%s user=%s score=%d",
                session.id, user_id, score,
            )
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
