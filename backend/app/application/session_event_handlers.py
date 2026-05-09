"""Post-commit handlers for SessionCompleted.

Splits the side-effect chain that previously lived inside
SessionApplicationService.end_session (leaderboard insert, achievement
check, stealth-assessment update) into independent handlers subscribed to
SessionCompleted via a tiny event bus. Each handler runs in its own UoW so
a downstream failure cannot roll back the already-durable session row;
isolation per-handler also keeps a programming error in one effect from
suppressing the others.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Callable

from sqlalchemy.exc import SQLAlchemyError

from app.domain.errors import DomainError
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.session.events import SessionCompleted

if TYPE_CHECKING:
    from app.application.achievement_service import AchievementApplicationService
    from app.application.assessment_service import AssessmentApplicationService
    from app.application.ports import UnitOfWork
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.domain.session.repository import GameSessionRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.user.repository import UserRepository

logger = logging.getLogger(__name__)


class LeaderboardInsertHandler:
    """Idempotently insert a LeaderboardEntry for a completed session.
    Practice-mode sessions are skipped (Backlog §20)."""

    def __init__(
        self,
        leaderboard_repo: "LeaderboardRepository",
        uow: "UnitOfWork",
    ) -> None:
        self._leaderboard_repo = leaderboard_repo
        self._uow = uow

    def __call__(self, event: SessionCompleted) -> None:
        if event.practice_mode:
            return
        with self._uow:
            existing = self._leaderboard_repo.find_by_session_id(event.session_id)
            if existing is None:
                entry = LeaderboardEntry.create_from_session(
                    user_id=event.user_id,
                    level=event.level,
                    score=event.score,
                    kills=event.kills,
                    waves_survived=event.waves_survived,
                    session_id=event.session_id,
                    challenge_id=event.challenge_id,
                )
                self._leaderboard_repo.save(entry)
            self._uow.commit()


class AchievementCheckHandler:
    """Run the achievement evaluator for a completed session and return the
    list of newly unlocked achievements so downstream handlers (and the
    end_session caller) can react to them."""

    def __init__(
        self,
        achievement_svc: "AchievementApplicationService | None",
        session_repo: "GameSessionRepository",
        territory_repo: "TerritoryRepository | None",
        uow: "UnitOfWork",
    ) -> None:
        self._achievement_svc = achievement_svc
        self._session_repo = session_repo
        self._territory_repo = territory_repo
        self._uow = uow

    def __call__(self, event: SessionCompleted) -> list:
        if self._achievement_svc is None:
            return []
        from app.shared_constants import INITIAL_HP

        with self._uow:
            session = self._session_repo.find_by_id(event.session_id, event.user_id)
            if session is None:
                logger.warning("Session %s not found for achievement check; skipping", event.session_id)
                return []
            origin_hp = session.health_origin if session.health_origin is not None else INITIAL_HP
            final_hp = session.health_final if session.health_final is not None else session.hp
            hp_lost = max(0, origin_hp - final_hp)
            gold_remaining = session.gold
            territories_held = 0
            territory_max_star = 0
            if self._territory_repo is not None:
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


class IaAccuracyRefreshHandler:
    """Recompute and persist the rolling Initial-Answer accuracy on the user
    aggregate after a session completes.

    Lives behind a SessionCompleted handler (B-ARCH-19) instead of being a
    direct user-aggregate write inside the session use case. Skips silently
    when ``user_repo`` is not wired (legacy unit-test construction).
    """

    def __init__(
        self,
        session_repo: "GameSessionRepository",
        user_repo: "UserRepository | None",
        uow: "UnitOfWork",
    ) -> None:
        self._session_repo = session_repo
        self._user_repo = user_repo
        self._uow = uow

    def __call__(self, event: SessionCompleted) -> None:
        if self._user_repo is None:
            return
        with self._uow:
            user = self._user_repo.find_by_id(event.user_id)
            if user is None:
                return
            user.update_ia_accuracy(
                self._session_repo.compute_ia_recent_accuracy(event.user_id)
            )
            self._user_repo.save(user)
            self._uow.commit()


class AssessmentEventHandler:
    """Translate newly-unlocked achievements into competency-evidence events
    for the stealth-assessment subsystem (Pedagogical_Backlog_Spec.md §8).
    Skips silently when the assessment subsystem is not wired."""

    def __init__(self, assessment_svc: "AssessmentApplicationService | None") -> None:
        self._assessment_svc = assessment_svc

    def __call__(self, user_id: str, unlocked: list) -> None:
        if self._assessment_svc is None or not unlocked:
            return
        events = [(a.achievement_id, True) for a in unlocked]
        self._assessment_svc.record_events(user_id, events)


class SessionEventBus:
    """Tiny dispatcher: end_session collects domain events from the aggregate,
    hands them to dispatch(), and gets back the achievement-unlock list so it
    can be threaded into the HTTP response. Each subscriber failure is
    isolated — a SQLAlchemy / DomainError surface in one handler does not
    suppress the others."""

    def __init__(
        self,
        leaderboard_handler: LeaderboardInsertHandler,
        achievement_handler: AchievementCheckHandler,
        assessment_handler: AssessmentEventHandler,
        ia_accuracy_handler: IaAccuracyRefreshHandler | None = None,
    ) -> None:
        self.leaderboard = leaderboard_handler
        self.achievement = achievement_handler
        self.assessment = assessment_handler
        self.ia_accuracy = ia_accuracy_handler

    def replay_leaderboard(self, event: SessionCompleted) -> None:
        """Idempotent leaderboard-only replay used by end_session's
        catch-up branch when the session is already COMPLETED. Skips the
        achievement / assessment handlers to avoid re-evaluating cumulative
        stats that already include this session."""
        self.leaderboard(event)

    def dispatch(self, events: list) -> list:
        newly_unlocked: list = []
        for event in events:
            if not isinstance(event, SessionCompleted):
                continue
            try:
                self.leaderboard(event)
            except (SQLAlchemyError, DomainError):
                logger.exception(
                    "leaderboard handler failed session=%s", event.session_id
                )
            unlocked: list = []
            try:
                unlocked = self.achievement(event)
                newly_unlocked.extend(unlocked)
            except (SQLAlchemyError, DomainError):
                logger.exception(
                    "achievement handler failed session=%s", event.session_id
                )
            try:
                self.assessment(event.user_id, unlocked)
            except (SQLAlchemyError, DomainError):
                logger.exception(
                    "assessment handler failed session=%s", event.session_id
                )
            if self.ia_accuracy is not None:
                try:
                    self.ia_accuracy(event)
                except (SQLAlchemyError, DomainError):
                    logger.exception(
                        "ia_accuracy handler failed session=%s", event.session_id
                    )
        return newly_unlocked
