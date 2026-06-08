"""Post-commit handlers for SessionCompleted.

Splits the side-effect chain that previously lived inside
SessionApplicationService.end_session (leaderboard insert, achievement
check, stealth-assessment update) into independent handlers subscribed to
SessionCompleted via a tiny event bus. Each handler runs in its own UoW so
a downstream failure cannot roll back the already-durable session row;
isolation per-handler also keeps a programming error in one effect from
suppressing the others.

H3 atomicity: AchievementCheckHandler optionally accepts an
AssessmentApplicationService and calls apply_evidence_in_open_uow inside
its UoW so achievement-unlock rows and their Beta-evidence rows commit
atomically. All services share one SqlAlchemyUnitOfWork per request
(see factories._get_uow), making this a single DB commit.
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.domain.errors import ConstraintViolationError, DomainError
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
    Practice-mode (Backlog §20) and teacher/admin preview runs are skipped."""

    def __init__(
        self,
        leaderboard_repo: "LeaderboardRepository",
        uow: "UnitOfWork",
    ) -> None:
        self._leaderboard_repo = leaderboard_repo
        self._uow = uow

    def __call__(self, event: SessionCompleted) -> None:
        if event.practice_mode or event.is_preview:
            return
        try:
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
                        # M-02: pass through the V3 total_score so rankings use
                        # the canonical floating-point value instead of raw score.
                        total_score=event.total_score,
                    )
                    self._leaderboard_repo.save(entry)
                self._uow.commit()
        except ConstraintViolationError:
            # M4: a concurrent handler (post-commit retry or duplicate delivery)
            # already inserted the row; uq_leaderboard_session_id guarantees
            # exactly-one entry, so this is the expected idempotent outcome.
            pass


class AchievementCheckHandler:
    """Run the achievement evaluator for a completed session and return the
    list of newly unlocked achievements so downstream handlers (and the
    end_session caller) can react to them.

    When assessment_svc is provided, Beta-evidence for the unlocked
    achievements is written inside the same UoW commit (H3 atomicity).
    """

    def __init__(
        self,
        achievement_svc: "AchievementApplicationService | None",
        session_repo: "GameSessionRepository",
        territory_repo: "TerritoryRepository | None",
        uow: "UnitOfWork",
        assessment_svc: "AssessmentApplicationService | None" = None,
    ) -> None:
        self._achievement_svc = achievement_svc
        self._session_repo = session_repo
        self._territory_repo = territory_repo
        self._uow = uow
        self._assessment_svc = assessment_svc

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
                completed_at=session.ended_at,
            )
            if result and self._assessment_svc is not None:
                evidence = [(a.achievement_id, True) for a in result]
                self._assessment_svc.apply_evidence_in_open_uow(event.user_id, evidence)
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


class SessionEventBus:
    """Tiny dispatcher: end_session collects domain events from the aggregate,
    hands them to dispatch(), and gets back the achievement-unlock list so it
    can be threaded into the HTTP response. Each subscriber failure is
    isolated — a SQLAlchemy / DomainError surface in one handler does not
    suppress the others.

    Achievement unlocks and their Beta-evidence are committed atomically
    inside AchievementCheckHandler (H3 fix); there is no separate assessment
    handler step in dispatch().
    """

    def __init__(
        self,
        leaderboard_handler: LeaderboardInsertHandler,
        achievement_handler: AchievementCheckHandler,
        ia_accuracy_handler: IaAccuracyRefreshHandler | None = None,
    ) -> None:
        self.leaderboard = leaderboard_handler
        self.achievement = achievement_handler
        self.ia_accuracy = ia_accuracy_handler

    def replay_leaderboard(self, event: SessionCompleted) -> None:
        """Idempotent leaderboard-only replay used by end_session's
        catch-up branch when the session is already COMPLETED. Skips the
        achievement handler to avoid re-evaluating cumulative stats that
        already include this session."""
        self.leaderboard(event)

    def dispatch(self, events: list) -> list:
        newly_unlocked: list = []
        for event in events:
            if not isinstance(event, SessionCompleted):
                continue
            # Catch Exception (not just DomainError) so unexpected errors
            # (e.g. network, ORM bugs) are logged rather than crashing
            # end_session. The leaderboard row remains missing with no retry;
            # a future outbox table would close that durability gap.
            try:
                self.leaderboard(event)
            except Exception:
                logger.exception(
                    "leaderboard handler failed session=%s", event.session_id
                )
            try:
                unlocked = self.achievement(event)
                newly_unlocked.extend(unlocked)
            except Exception:
                logger.exception(
                    "achievement handler failed session=%s", event.session_id
                )
            if self.ia_accuracy is not None:
                try:
                    self.ia_accuracy(event)
                except Exception:
                    logger.exception(
                        "ia_accuracy handler failed session=%s", event.session_id
                    )
        return newly_unlocked
