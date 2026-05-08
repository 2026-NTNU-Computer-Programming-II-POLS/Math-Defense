"""SessionApplicationService — Orchestrates GameSession Use Cases"""
from __future__ import annotations

import dataclasses
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.domain.errors import (
    ConstraintViolationError,
    PersistenceError,
    ReplayMismatchError,
    SessionNotFoundError,
    SessionStaleError,
    Star5LockedError,
)
from app.domain.value_objects import Level, Score, GameResult, SessionStatus
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.leaderboard.aggregate import LeaderboardEntry
from app.domain.scoring.score_calculator import recompute_total_score
from app.infrastructure.wasm_runtime import get_pow_fn, is_wasm_loaded
if TYPE_CHECKING:
    from app.application.achievement_service import AchievementApplicationService
    from app.application.assessment_service import AssessmentApplicationService
    from app.application.ports import UnitOfWork
    from app.domain.challenge.repository import ChallengeRepository
    from app.domain.session.repository import GameSessionRepository
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.user.repository import UserRepository

logger = logging.getLogger(__name__)


@dataclass
class EndSessionResult:
    """Return value of end_session, carrying both the session and any newly unlocked achievements."""
    session: GameSession
    newly_unlocked: list[dict]


@dataclass
class AttachReflectionResult:
    """Return value of attach_reflection. ``overwritten`` is True when the
    submission replaced a non-empty prior reflection — callers (the router)
    use this flag to emit an audit-log entry."""
    session: GameSession
    overwritten: bool
    previous_text: str | None


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
        uow: UnitOfWork,
        achievement_svc: AchievementApplicationService | None = None,
        territory_repo: TerritoryRepository | None = None,
        assessment_svc: AssessmentApplicationService | None = None,
        user_repo: UserRepository | None = None,
        challenge_repo: ChallengeRepository | None = None,
    ) -> None:
        self._session_repo = session_repo
        self._leaderboard_repo = leaderboard_repo
        self._uow = uow
        self._achievement_svc = achievement_svc
        self._territory_repo = territory_repo
        self._assessment_svc = assessment_svc
        self._user_repo = user_repo
        # Backlog §23 — optional so legacy unit tests can construct the service
        # without challenges. End-session validates the wave_count override only
        # when this dependency is present.
        self._challenge_repo = challenge_repo

    def create_session(
        self,
        user_id: str,
        level: int,
        initial_answer: bool = False,
        path_config: dict | None = None,
        practice_mode: bool = False,
        challenge_id: str | None = None,
        rng_seed: int | None = None,
        replay_version: int = 1,
    ) -> GameSession:
        # Under PG, find_active_by_user holds a row lock via with_for_update, so the
        # race between concurrent creates is closed. The retry here is defence-in-depth
        # for the case where no row exists yet (FOR UPDATE has nothing to lock) and
        # two inserts both reach the unique partial index simultaneously.
        for attempt in range(2):
            try:
                return self._create_session_once(
                    user_id, level, initial_answer, path_config, practice_mode,
                    challenge_id, rng_seed, replay_version,
                )
            except ConstraintViolationError as e:
                if attempt == 1 or e.constraint_name != _ACTIVE_SESSION_UNIQUE_INDEX:
                    raise
                logger.info("create_session race: retrying after abandoning concurrent active session user=%s", user_id)
        raise RuntimeError("unreachable")

    def _create_session_once(
        self,
        user_id: str,
        level: int,
        initial_answer: bool = False,
        path_config: dict | None = None,
        practice_mode: bool = False,
        challenge_id: str | None = None,
        rng_seed: int | None = None,
        replay_version: int = 1,
    ) -> GameSession:
        with self._uow:
            # 0. Star-5 personal lock (Habgood & Ainsworth 2011): the user must
            # have completed the Initial-Answer phase correctly at any star
            # rating at least once before Star-5 becomes selectable. Teacher-
            # curated Grabbing Territory slots intentionally bypass this gate
            # because slot creation never reaches this code path; see the
            # docstring on app.application.territory_service for the carve-out.
            if level == 5 and not self._session_repo.has_correct_ia_session(user_id):
                raise Star5LockedError()

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
            session = GameSession.create(
                user_id,
                Level(level),
                initial_answer=initial_answer,
                path_config=path_config,
                practice_mode=practice_mode,
                challenge_id=challenge_id,
                rng_seed=rng_seed,
                replay_version=replay_version,
            )
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
    ) -> EndSessionResult:
        pending_events: list = []
        with self._uow:
            session = self._session_repo.find_by_id_for_update(session_id, user_id)
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
                except PersistenceError:
                    logger.exception("leaderboard catch-up failed session=%s", session.id)
                return EndSessionResult(session=session, newly_unlocked=[])
            self._ensure_not_stale_or_abandon(session)
            result = GameResult(
                score=Score(score),
                kills=kills,
                waves_survived=waves_survived,
            )
            # Backlog §23 — when this session was launched from a challenge,
            # narrow the wave cap to the challenge's wave_count. Server-side
            # enforcement: a tampered client cannot bypass the per-challenge
            # ceiling.
            wave_cap_override = self._challenge_wave_cap(session.challenge_id)
            session.complete(result, wave_cap_override=wave_cap_override)
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

            # Recompute the rolling-10 IA accuracy and persist it on the user
            # aggregate so the next level start can drive concrete-fading on
            # the path renderer (spec §17). Lives in the same UoW as the
            # session save: if it fails, the whole end_session is retried via
            # the COMPLETED-status idempotent path on the next attempt.
            self._refresh_ia_recent_accuracy(user_id)

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
        newly_unlocked_dicts = [
            {"id": a.achievement_id, "talent_points": a.talent_points}
            for a in newly_unlocked
        ]
        return EndSessionResult(session=session, newly_unlocked=newly_unlocked_dicts)

    def _dispatch_post_commit(self, events: list) -> list:
        newly_unlocked: list = []
        for event in events:
            if not isinstance(event, SessionCompleted):
                continue
            try:
                with self._uow:
                    self._handle_session_completed(event)
                    self._uow.commit()
            except PersistenceError:
                logger.exception(
                    "post-commit dispatch failed session=%s", event.session_id
                )
            unlocked: list = []
            try:
                unlocked = self._check_achievements(event)
                newly_unlocked.extend(unlocked)
            except Exception:
                logger.exception(
                    "achievement check failed session=%s", event.session_id
                )
            # Stealth-assessment update (Pedagogical_Backlog_Spec.md §8): each
            # newly-unlocked achievement is positive evidence for the
            # competencies its Q-matrix row loads on. Failures here must not
            # roll back the achievement insert — the assessment service runs
            # in its own UoW for that reason.
            try:
                self._record_assessment_events(event.user_id, unlocked)
            except Exception:
                logger.exception(
                    "assessment update failed session=%s", event.session_id
                )
        return newly_unlocked

    def _record_assessment_events(self, user_id: str, unlocked: list) -> None:
        if not self._assessment_svc or not unlocked:
            return
        events = [(a.achievement_id, True) for a in unlocked]
        self._assessment_svc.record_events(user_id, events)

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

    def list_reflections_for_users(
        self, user_ids: list[str], limit: int = 100
    ) -> list[GameSession]:
        """Read-only: most-recent completed sessions with reflections for a
        set of users. Caller is responsible for the access-control check
        (typically: teacher owns the class containing these users)."""
        return self._session_repo.find_reflections_for_users(user_ids, limit=limit)

    def attach_reflection(
        self, session_id: str, user_id: str, text: str
    ) -> AttachReflectionResult:
        """Attach a post-wave reflection to a completed session.

        Enforces ownership (404 on cross-user access) and the domain
        invariant that reflections require COMPLETED status. Overwriting an
        existing non-empty reflection is allowed but reported back to the
        caller so an audit-log entry can be emitted.
        """
        with self._uow:
            session = self._session_repo.find_by_id(session_id, user_id)
            if not session:
                raise SessionNotFoundError("Session not found")
            previous = session.reflection_text
            session.record_reflection(text)
            self._session_repo.save(session)
            self._uow.commit()
            overwritten = bool(previous) and previous != session.reflection_text
            return AttachReflectionResult(
                session=session,
                overwritten=overwritten,
                previous_text=previous,
            )

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
        """Handle session completed event — auto-create leaderboard entry (idempotent).

        Practice-mode sessions (Backlog §20) are excluded from the global
        leaderboard. The session row stays authoritative; we just don't emit
        a LeaderboardEntry for it.
        """
        # Re-read the session to learn whether the run was practice_mode. The
        # event payload is the public domain message and we keep that surface
        # narrow rather than threading practice_mode through every consumer.
        session = self._session_repo.find_by_id(event.session_id, event.user_id)
        if session is not None and session.practice_mode:
            return
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
            # Backlog §23 — read from the server-side session aggregate, not
            # the event payload, so a tampered end-payload cannot misroute the
            # entry into a challenge ranking it doesn't belong to.
            challenge_id=session.challenge_id if session is not None else None,
        )
        self._leaderboard_repo.save(entry)

    def _challenge_wave_cap(self, challenge_id: str | None) -> int | None:
        """Look up the wave_count for a challenge, or None when no challenge
        is attached or the challenge_repo dependency is absent (legacy callers)."""
        if challenge_id is None or self._challenge_repo is None:
            return None
        challenge = self._challenge_repo.find_by_id(challenge_id)
        if challenge is None or challenge.is_deleted:
            return None
        return challenge.constraints.wave_count

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

        v1 sessions: log a warning on mismatch and replace the client value
        with the server-authoritative result so the DB always stores the
        canonical figure.

        v2 sessions (FU-A, construction plan §8): the client and server share
        the same musl pow via WASM, so a mismatch beyond 4-decimal rounding is
        treated as tampering and rejected with HTTP 422 + ``replay_mismatch``.
        Strict-rejection mode only kicks in when the WASM runtime actually
        loaded — without it the backend falls back to Python pow and we widen
        to v1's ε tolerance because bit-equality cannot be guaranteed.
        """
        recomputed = recompute_total_score(
            kill_value=session.kill_value,
            time_total=session.time_total,
            time_exclude_prepare=session.time_exclude_prepare,
            cost_total=session.cost_total,
            health_origin=session.health_origin,
            health_final=session.health_final,
            initial_answer=session.initial_answer,
            pow_fn=get_pow_fn(),
        )
        if recomputed is None:
            if session.total_score is not None:
                logger.warning(
                    "total_score submitted but V2 fields incomplete session=%s; discarding client value",
                    session.id,
                )
                session.override_total_score(None)
            return
        submitted = session.total_score
        if submitted is not None:
            replay_version = getattr(session, "replay_version", 1) or 1
            strict = replay_version >= 2 and is_wasm_loaded()
            # Frontend rounds totalScore to 4 decimal places; even in strict
            # mode we must absorb the rounding step or every legitimate v2
            # submission would 422. 5e-5 is the upper bound on round4 error;
            # 1e-4 leaves a 2× safety margin without accepting meaningful
            # manipulation. v1 keeps the legacy 5e-4 ε.
            tolerance = 1e-4 if strict else 5e-4
            if abs(recomputed - submitted) > tolerance:
                if strict:
                    logger.warning(
                        "replay_mismatch v2 session=%s submitted=%.6f recomputed=%.6f",
                        session.id, submitted, recomputed,
                    )
                    raise ReplayMismatchError(submitted=submitted, recomputed=recomputed)
                logger.warning(
                    "total_score mismatch session=%s submitted=%.4f recomputed=%.4f; using server value",
                    session.id, submitted, recomputed,
                )
        session.override_total_score(recomputed)

    def _refresh_ia_recent_accuracy(self, user_id: str) -> None:
        """Recompute and persist the rolling-10 IA accuracy on the user.

        Runs inside the same UoW as session.save so the value lands together
        with the just-completed session row. The user_repo dependency is
        optional — if absent, we skip silently (e.g. service constructed in
        a unit test without a user_repo)."""
        if self._user_repo is None:
            return
        user = self._user_repo.find_by_id(user_id)
        if user is None:
            return
        user.ia_recent_accuracy = self._session_repo.compute_ia_recent_accuracy(user_id)
        self._user_repo.save(user)

    def _abandon_and_commit(self, session: GameSession) -> None:
        session.abandon()
        self._session_repo.save(session)
        self._uow.commit()
