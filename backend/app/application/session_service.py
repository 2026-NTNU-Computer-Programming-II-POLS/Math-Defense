"""SessionApplicationService — Orchestrates GameSession Use Cases"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.domain.errors import SessionNotFoundError, SessionStaleError
from app.domain.value_objects import Level, Score, GameResult, SessionStatus
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.utils.integrity import is_constraint_violation

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
        # Under PG, find_active_by_user holds a row lock via with_for_update, so the
        # race between concurrent creates is closed. The retry here is defence-in-depth
        # for the case where no row exists yet (FOR UPDATE has nothing to lock) and
        # two inserts both reach the unique partial index simultaneously.
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
        pending_events: list = []
        with self._uow:
            session = self._session_repo.find_by_id(session_id, user_id)
            if not session:
                raise SessionNotFoundError("Session not found")
            # Idempotent retry: if the session is already completed, return it.
            # Also catch up any dropped post-commit handlers from a prior run
            # (e.g. leaderboard insert failed after session commit). The handler
            # is itself idempotent via find_by_session_id.
            if session.status == SessionStatus.COMPLETED:
                catch_up = SessionCompleted(
                    session_id=session.id,
                    user_id=session.user_id,
                    level=int(session.level),
                    score=session.score,
                    kills=session.kills,
                    waves_survived=session.waves_survived,
                )
                self._dispatch_post_commit([catch_up])
                return session
            self._ensure_not_stale_or_abandon(session)
            result = GameResult(
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
            )
            session.complete(result)
            self._session_repo.save(session)

            # Snapshot events before commit so a durable copy survives the
            # aggregate going out of scope. Do NOT clear yet — clearing belongs
            # after a successful handler dispatch (D-6), but because dispatch
            # runs in its own UoW after commit (D-5), the in-memory aggregate is
            # discarded with the request anyway.
            pending_events = session.collect_events()

            self._uow.commit()
            logger.info(
                "Session ended: session=%s user=%s score=%d",
                session.id, user_id, score,
            )

        # Post-commit dispatch: session completion is now durable. Handler runs
        # in a separate UoW so a leaderboard-insert failure cannot roll back the
        # already-committed session. Idempotency in _handle_session_completed
        # makes retries (via end_session catch-up or background sweeper) safe.
        self._dispatch_post_commit(pending_events)
        return session

    def _dispatch_post_commit(self, events: list) -> None:
        for event in events:
            if not isinstance(event, SessionCompleted):
                continue
            try:
                with self._uow:
                    self._handle_session_completed(event)
                    self._uow.commit()
            except SQLAlchemyError:
                # Session is already durably committed; DB-layer failure in
                # the handler is the recoverable case — log and let a future
                # retry (client resubmit, background catch-up) re-dispatch
                # via the idempotent handler. Non-DB exceptions (bugs) are
                # re-raised so they surface instead of silently vanishing.
                logger.exception(
                    "post-commit dispatch failed session=%s", event.session_id
                )

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
                self._abandon_and_commit(session)
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
        self._ensure_not_stale_or_abandon(session)
        return session

    def _ensure_not_stale_or_abandon(self, session: GameSession) -> None:
        """If the session has timed out, abandon it and raise SessionStaleError.

        Commits before raising so the surrounding UoW.__exit__ cannot roll the
        abandon back. Shared by _get_session and end_session so the stale-check
        rule stays in one place.
        """
        if not session.is_stale:
            return
        self._abandon_and_commit(session)
        raise SessionStaleError(
            "Session timed out (over 2 hours) and was automatically abandoned"
        )

    def _abandon_and_commit(self, session: GameSession) -> None:
        session.abandon()
        self._session_repo.save(session)
        self._uow.commit()


def _is_active_session_conflict(err: IntegrityError) -> bool:
    """Return True iff err was raised by the one-active-session-per-user unique index.

    FK, check, or unrelated unique violations indicate a real bug and must
    surface — so we match on the exact constraint/index name rather than
    any broader heuristic.
    """
    return is_constraint_violation(err, constraint_name=_ACTIVE_SESSION_UNIQUE_INDEX)
