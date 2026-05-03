"""SessionApplicationService — Orchestrates GameSession Use Cases"""
from __future__ import annotations

import dataclasses
import logging
from typing import TYPE_CHECKING

from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.domain.errors import SessionNotFoundError, SessionStaleError
from app.domain.value_objects import Level, Score, GameResult, SessionStatus
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.scoring.score_calculator import recompute_total_score
from app.utils.integrity import is_constraint_violation

if TYPE_CHECKING:
    from app.application.achievement_service import AchievementApplicationService
    from app.domain.session.repository import GameSessionRepository
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.domain.territory.repository import TerritoryRepository
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
        achievement_svc: AchievementApplicationService | None = None,
        territory_repo: TerritoryRepository | None = None,
    ) -> None:
        self._session_repo = session_repo
        self._leaderboard_repo = leaderboard_repo
        self._uow = uow
        self._achievement_svc = achievement_svc
        self._territory_repo = territory_repo

    def create_session(self, user_id: str, level: int, initial_answer: bool = False, path_config: dict | None = None) -> GameSession:
        # Under PG, find_active_by_user holds a row lock via with_for_update, so the
        # race between concurrent creates is closed. The retry here is defence-in-depth
        # for the case where no row exists yet (FOR UPDATE has nothing to lock) and
        # two inserts both reach the unique partial index simultaneously.
        for attempt in range(2):
            try:
                return self._create_session_once(user_id, level, initial_answer, path_config)
            except IntegrityError as e:
                if attempt == 1 or not _is_active_session_conflict(e):
                    raise
                logger.info("create_session race: retrying after abandoning concurrent active session user=%s", user_id)
        raise RuntimeError("unreachable")

    def _create_session_once(self, user_id: str, level: int, initial_answer: bool = False, path_config: dict | None = None) -> GameSession:
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
            session = GameSession.create(user_id, Level(level), initial_answer=initial_answer, path_config=path_config)
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
        kill_value: int | None = None,
        cost_total: int | None = None,
    ) -> GameSession:
        with self._uow:
            session = self._get_session(session_id, user_id)
            session.update_progress(
                current_wave=current_wave,
                gold=gold,
                hp=hp,
                score=score,
                kill_value=kill_value,
                cost_total=cost_total,
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
        kill_value: int | None = None,
        cost_total: int | None = None,
        time_total: float | None = None,
        health_origin: int | None = None,
        health_final: int | None = None,
        time_exclude_prepare: list[float] | None = None,
        total_score: float | None = None,
    ) -> GameSession:
        pending_events: list = []
        with self._uow:
            session = self._session_repo.find_by_id(session_id, user_id)
            if not session:
                raise SessionNotFoundError("Session not found")
            # Idempotent retry: if the session is already completed, return it.
            # Catch up only the leaderboard handler (idempotent via find_by_session_id)
            # — skip achievement re-evaluation to avoid re-triggering cumulative
            # stat checks against totals that already include this session.
            if session.status == SessionStatus.COMPLETED:
                catch_up = SessionCompleted(
                    session_id=session.id,
                    user_id=session.user_id,
                    level=int(session.level),
                    score=session.score,
                    kills=session.kills,
                    waves_survived=session.waves_survived,
                    total_score=session.total_score,
                )
                try:
                    with self._uow:
                        self._handle_session_completed(catch_up)
                        self._uow.commit()
                except SQLAlchemyError:
                    logger.exception("leaderboard catch-up failed session=%s", session.id)
                return session
            self._ensure_not_stale_or_abandon(session)
            result = GameResult(
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
            )
            session.complete(result)
            session.record_scoring_context(
                kill_value=kill_value,
                cost_total=cost_total,
                time_total=time_total,
                health_origin=health_origin,
                health_final=health_final,
                time_exclude_prepare=time_exclude_prepare,
                total_score=total_score,
            )
            # Overwrite client-submitted total_score with server-recomputed value
            # before committing so the DB always stores the canonical figure.
            self._verify_score(session)
            self._session_repo.save(session)

            # Snapshot events and backfill total_score now that _verify_score has
            # set the authoritative value. The aggregate emits SessionCompleted
            # during complete() before total_score is known, so we patch it here.
            pending_events = [
                dataclasses.replace(e, total_score=session.total_score)
                if isinstance(e, SessionCompleted) else e
                for e in session.collect_events()
            ]

            self._uow.commit()
            logger.info(
                "Session ended: session=%s user=%s score=%d",
                session.id, user_id, score,
            )

        # Post-commit dispatch: session completion is now durable. Handler runs
        # in a separate UoW so a leaderboard-insert failure cannot roll back the
        # already-committed session. Idempotency in _handle_session_completed
        # makes retries (via end_session catch-up or background sweeper) safe.
        newly_unlocked = self._dispatch_post_commit(pending_events)
        session._newly_unlocked_achievements = [
            {"id": a.achievement_id, "talent_points": a.talent_points}
            for a in newly_unlocked
        ]
        return session

    def _dispatch_post_commit(self, events: list) -> list:
        newly_unlocked: list = []
        for event in events:
            if not isinstance(event, SessionCompleted):
                continue
            try:
                with self._uow:
                    self._handle_session_completed(event)
                    self._uow.commit()
            except SQLAlchemyError:
                logger.exception(
                    "post-commit dispatch failed session=%s", event.session_id
                )
            try:
                unlocked = self._check_achievements(event)
                newly_unlocked.extend(unlocked)
            except Exception:
                logger.exception(
                    "achievement check failed session=%s", event.session_id
                )
        return newly_unlocked

    def _check_achievements(self, event: SessionCompleted) -> list:
        if not self._achievement_svc:
            return []
        with self._uow:
            from app.shared_constants import INITIAL_HP
            session = self._session_repo.find_by_id(event.session_id, event.user_id)
            if not session:
                logger.warning("Session %s not found for achievement check; skipping", event.session_id)
                return []
            origin_hp = session.health_origin if session.health_origin is not None else INITIAL_HP
            final_hp = session.health_final if session.health_final is not None else session.hp
            hp_lost = max(0, origin_hp - final_hp)
            gold_remaining = session.gold
            territories_held = 0
            territory_max_star = 0
            if self._territory_repo:
                territories_held = self._territory_repo.count_territories_by_student(event.user_id)
                territory_max_star = self._territory_repo.find_max_star_for_student(event.user_id)
            result = self._achievement_svc.check_and_unlock(
                user_id=event.user_id,
                session_score=event.score,
                session_kills=event.kills,
                session_waves=event.waves_survived,
                session_star=event.level,
                session_hp_lost=hp_lost,
                session_gold_remaining=gold_remaining,
                territories_held=territories_held,
                territory_max_star=territory_max_star,
            )
            self._uow.commit()
        return result

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

    def _verify_score(self, session: GameSession) -> None:
        """Recompute total_score server-side and overwrite session.total_score.

        On mismatch, logs a warning and replaces the client value with the
        server-authoritative result so the DB always stores the canonical figure.
        """
        recomputed = recompute_total_score(
            kill_value=session.kill_value,
            time_total=session.time_total,
            time_exclude_prepare=session.time_exclude_prepare,
            cost_total=session.cost_total,
            health_origin=session.health_origin,
            health_final=session.health_final,
            initial_answer=session.initial_answer,
        )
        if recomputed is None:
            if session.total_score is not None:
                logger.warning(
                    "total_score submitted but V2 fields incomplete session=%s; discarding client value",
                    session.id,
                )
                session.total_score = None
            return
        submitted = session.total_score
        if submitted is not None:
            # Frontend rounds totalScore to 4 decimal places; max rounding error is 5e-5.
            # Tolerance of 0.0005 gives a 10x safety margin over rounding without accepting
            # significant manipulation at either extreme of the score range.
            tolerance = 0.0005
            if abs(recomputed - submitted) > tolerance:
                logger.warning(
                    "total_score mismatch session=%s submitted=%.4f recomputed=%.4f; using server value",
                    session.id, submitted, recomputed,
                )
        session.total_score = recomputed

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
