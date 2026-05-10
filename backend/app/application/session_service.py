"""SessionApplicationService — Orchestrates GameSession Use Cases"""
from __future__ import annotations

import dataclasses
import logging
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy.exc import OperationalError

from app.domain.errors import (
    ConstraintViolationError,
    PersistenceError,
    ReplayMismatchError,
    ReplayUnavailableError,
    SessionNotFoundError,
    SessionStaleError,
    Star5LockedError,
)
from app.domain.value_objects import Level, Score, GameResult, SessionStatus
from app.domain.session.aggregate import GameSession
from app.domain.session.events import SessionCompleted
from app.domain.scoring.score_calculator import recompute_total_score
from app.infrastructure.wasm_runtime import get_pow_fn, get_total_score_fn, is_wasm_loaded
if TYPE_CHECKING:
    from app.application.achievement_service import AchievementApplicationService
    from app.application.assessment_service import AssessmentApplicationService
    from app.application.ports import UnitOfWork
    from app.domain.challenge.repository import ChallengeRepository
    from app.domain.session.events_log import ReplayEventRepository
    from app.domain.session.repository import GameSessionRepository
    from app.domain.leaderboard.repository import LeaderboardRepository
    from app.domain.territory.repository import TerritoryRepository
    from app.domain.user.repository import UserRepository


# B-BUG-8 / C-01: event_type strings emitted by the EventRecorder for wave
# boundaries (kept in sync with frontend/src/data/constants.ts). Used to
# derive authoritative waves_survived and timing inputs from the persisted
# event log so neither can be forged by a tampered client.
_WAVE_START_EVENT_TYPE = "waveStart"
_WAVE_END_EVENT_TYPE = "waveEnd"

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
        event_repo: "ReplayEventRepository | None" = None,
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
        # B-BUG-8: when present, end_session derives waves_survived from the
        # recorded event log rather than the client-supplied value. Optional
        # so unit tests can construct the service without §24 wiring; in
        # those cases end_session falls back to the existing per-level caps.
        self._event_repo = event_repo
        # B-ARCH-4: side-effects (leaderboard / achievements / assessment) live
        # behind an event bus so this service stays a thin lifecycle module.
        from app.application.session_event_handlers import (
            AchievementCheckHandler,
            IaAccuracyRefreshHandler,
            LeaderboardInsertHandler,
            SessionEventBus,
        )
        self._event_bus = SessionEventBus(
            leaderboard_handler=LeaderboardInsertHandler(leaderboard_repo, uow),
            achievement_handler=AchievementCheckHandler(
                achievement_svc, session_repo, territory_repo, uow,
                assessment_svc=assessment_svc,
            ),
            ia_accuracy_handler=IaAccuracyRefreshHandler(
                session_repo, user_repo, uow,
            ),
        )

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
            # B-BUG-12: per-user advisory lock at the very top of the
            # transaction so concurrent creates serialise instead of racing
            # the unique partial index and burning through the retry budget.
            self._session_repo.acquire_user_create_lock(user_id)
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
        score: int | None = None,
        kill_value: int | None = None,
        cost_total: int | None = None,
    ) -> GameSession:
        # B-BUG-17: gold/hp are no longer passable from HTTP callers. The
        # aggregate's update_progress still accepts them for future
        # server-side derivation from the replay event log, but the client
        # cannot drive them.
        with self._uow:
            session = self._get_session(session_id, user_id)
            session.update_progress(
                current_wave=current_wave,
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
        # M22: replay_leaderboard opens its own UoW (via LeaderboardInsertHandler).
        # Calling it inside the outer `with self._uow:` would trigger the
        # non-reentrant guard. For the COMPLETED path we snapshot all scalar
        # data before the UoW exits, then call replay_leaderboard outside.
        _catch_up_event: SessionCompleted | None = None

        with self._uow:
            session = self._session_repo.find_by_id_for_update(session_id, user_id)
            if not session:
                raise SessionNotFoundError("Session not found")
            # Idempotent retry: if the session is already completed, snapshot the
            # event data and fall through without committing.  replay_leaderboard
            # runs below, outside this UoW, in its own transaction.
            if session.status == SessionStatus.COMPLETED:
                _catch_up_event = SessionCompleted(
                    session_id=session.id,
                    user_id=session.user_id,
                    level=int(session.level),
                    score=session.score,
                    kills=session.kills,
                    waves_survived=session.waves_survived,
                    total_score=session.total_score,
                    challenge_id=session.challenge_id,
                    practice_mode=session.practice_mode,
                )
                # Exiting without commit — __exit__ rolls back (releasing the
                # FOR UPDATE lock) and replay_leaderboard runs below.
            else:
                self._ensure_not_stale_or_abandon(session)
                # B-BUG-8 / C-01: load the replay event log once; reuse it for
                # both the waves_survived derivation below and the timing derivation
                # inside _verify_score to avoid two DB round-trips per end_session.
                # Kills aren't in the event stream by design (see EventRecorder
                # docstring — output events are derivable from input + seed and
                # would 10–100× the log size); the per-level cap in the aggregate
                # remains the kill-side defense.
                replay_events = self._load_events_for_session(session.id)
                authoritative_waves = self._derive_waves_from_events(
                    session.id, events=replay_events
                )
                if authoritative_waves is not None:
                    if waves_survived > authoritative_waves:
                        logger.warning(
                            "waves_survived inflated session=%s submitted=%d derived=%d",
                            session.id, waves_survived, authoritative_waves,
                        )
                    waves_survived = authoritative_waves
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
                self._verify_score(session, events=replay_events)
                self._session_repo.save(session)

                # Rolling-10 IA accuracy is recomputed by IaAccuracyRefreshHandler
                # post-commit (B-ARCH-19) so the cross-aggregate User write does
                # not live inside the session use case. The handler is idempotent,
                # so end_session's COMPLETED-status retry path still re-converges
                # the user's ia_recent_accuracy on transient failures.

                # Snapshot events and backfill total_score now that _verify_score has
                # set the authoritative value. The aggregate emits SessionCompleted
                # during complete() before total_score is known, so we patch it here.
                pending_events = [
                    dataclasses.replace(e, total_score=session.total_score)
                    if isinstance(e, SessionCompleted) else e
                    for e in session.collect_events()
                ]
                # B-BUG-14: drain the event buffer now that we've snapshotted it.
                # Without this the aggregate retains processed events; harmless
                # today (we never read collect_events twice on the same instance)
                # but latches the moment any aggregate cache lets the same
                # GameSession instance be reused — events would re-dispatch.
                session.clear_events()

                self._uow.commit()
                logger.info(
                    "Session ended: session=%s user=%s score=%d",
                    session.id, user_id, score,
                )

        if _catch_up_event is not None:
            # COMPLETED path: run leaderboard catch-up outside the UoW so the
            # handler's own `with self._uow:` does not nest inside ours.
            try:
                self._event_bus.replay_leaderboard(_catch_up_event)
            except PersistenceError:
                logger.exception("leaderboard catch-up failed session=%s", session.id)
            return EndSessionResult(session=session, newly_unlocked=[])

        # Normal path post-commit dispatch: session completion is now durable.
        # Handler runs in a separate UoW so a leaderboard-insert failure cannot
        # roll back the already-committed session. Handler idempotency makes
        # retries (via end_session catch-up or background sweeper) safe.
        newly_unlocked = self._dispatch_post_commit(pending_events)
        newly_unlocked_dicts = [
            {"id": a.achievement_id, "talent_points": a.talent_points}
            for a in newly_unlocked
        ]
        return EndSessionResult(session=session, newly_unlocked=newly_unlocked_dicts)

    def _dispatch_post_commit(self, events: list) -> list:
        # B-ARCH-4: dispatch is delegated to SessionEventBus so this service
        # owns lifecycle only. Each handler runs in its own UoW; failures are
        # logged per-handler and never roll back the (already durable)
        # session row. A future outbox table inside the same UoW as the
        # session save would replace this best-effort dispatch.
        return self._event_bus.dispatch(events)

    def has_correct_ia_session(self, user_id: str) -> bool:
        """Star-5 personal-unlock predicate. Routers that need to render
        the IA-unlock state on /auth/me consume this rather than reaching
        into the session repository directly."""
        return self._session_repo.has_correct_ia_session(user_id)

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

    def _load_events_for_session(self, session_id: str):
        """Fetch the full replay event log, returning None on missing repo or error.

        Centralises the try/except so both wave-count and timing derivation
        share a single DB round-trip when called from ``end_session``.
        """
        if self._event_repo is None:
            return None
        try:
            return self._event_repo.list_for_session(session_id)
        except OperationalError:
            raise
        except Exception:
            logger.exception("failed reading event log session=%s", session_id)
            return None

    def _derive_waves_from_events(
        self, session_id: str, events=None
    ) -> int | None:
        """Count ``waveEnd`` events in the replay log for ``session_id``.

        ``events`` may be pre-fetched by the caller to avoid a second DB read;
        if None the log is fetched here. Returns None when the event_repo dep
        is not wired (legacy unit tests). Errors fall through as None — the
        deriver is a defense-in-depth check, not a hard requirement.
        """
        if events is None:
            events = self._load_events_for_session(session_id)
        if events is None:
            return None
        return sum(1 for e in events if e.event_type == _WAVE_END_EVENT_TYPE)

    def _derive_timing_from_events(
        self, session_id: str, events=None
    ) -> tuple[float, list[float]] | None:
        """Derive (time_total_min, time_exclude_prepare) from waveStart/waveEnd timestamps.

        C-01 anti-cheat: the replay log stores game-time ``ts`` for each
        recorded event. The gap between consecutive waveEnd[i] and
        waveStart[i+1] is the prepare (build) phase duration — that is exactly
        what ``time_exclude_prepare[i]`` should contain. The last event's ``ts``
        gives a floor on ``time_total`` (the game ran for at least that long).

        ``events`` may be pre-fetched by the caller to avoid a second DB read.
        Returns None when the event_repo is absent or the log is empty.
        Errors fall through as None so a log-read failure never breaks end_session.
        """
        if events is None:
            events = self._load_events_for_session(session_id)
        if not events:
            return None

        all_ts = [e.ts for e in events]
        wave_end_ts = sorted(e.ts for e in events if e.event_type == _WAVE_END_EVENT_TYPE)
        wave_start_ts = sorted(e.ts for e in events if e.event_type == _WAVE_START_EVENT_TYPE)

        time_total_min = max(all_ts)

        prepare_durations: list[float] = []
        for end_ts in wave_end_ts:
            next_starts = [s for s in wave_start_ts if s > end_ts]
            if next_starts:
                gap = min(next_starts) - end_ts
                if gap > 0:
                    prepare_durations.append(gap)

        return time_total_min, prepare_durations

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

    def _verify_score(self, session: GameSession, events=None) -> None:
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

        C-01: timing inputs (time_total, time_exclude_prepare) are derived
        server-side from the replay event log (pre-fetched via ``events``) and
        used to validate / floor the client-supplied values:
        - time_total: floored at the last event timestamp; a submitted value
          more than 0.5 s below the floor is replaced. This correctly rejects
          the time_total=0.001 attack because the recomputed score then
          diverges from the submitted one.
        - time_exclude_prepare: replaced only when the client claims more than
          max(5 s, 5 % of the derived sum) extra prepare time, indicating clear
          inflation. Unconditional replacement is intentionally avoided — even
          0.1 s of game-time precision drift changes s1 by far more than the
          1e-4 strict-mode tolerance and would falsely reject legitimate v2
          submissions.
        """
        time_total = session.time_total
        time_exclude_prepare = session.time_exclude_prepare

        derived = self._derive_timing_from_events(session.id, events=events)
        if derived is not None:
            derived_time_total_min, derived_prepare = derived
            # Floor time_total: a submitted value below the event-log proof is
            # impossible, so we raise it. For v2 this causes a score mismatch
            # → ReplayMismatchError (correct rejection). For v1 the existing
            # warn-and-overwrite path handles it.
            if time_total is None or time_total < derived_time_total_min - 0.5:
                if time_total is not None:
                    logger.warning(
                        "time_total underflow session=%s submitted=%.3f derived_min=%.3f",
                        session.id, time_total, derived_time_total_min,
                    )
                time_total = derived_time_total_min
            # Validate prepare sum: replace only when the client claims
            # substantially more prepare time than events show. The threshold
            # (max 5 s, 5 % of derived sum) is far above real timing precision
            # (< 0.1 s per phase) so legitimate submissions are never affected.
            if time_exclude_prepare is not None:
                client_sum = sum(time_exclude_prepare)
                server_sum = sum(derived_prepare)
                if client_sum > server_sum + max(5.0, server_sum * 0.05):
                    logger.warning(
                        "time_exclude_prepare inflated session=%s "
                        "client_sum=%.3f derived_sum=%.3f; using server values",
                        session.id, client_sum, server_sum,
                    )
                    time_exclude_prepare = derived_prepare

        # H1: cost_total=0 with kills is economically impossible (towers must be
        # purchased to kill). Force recomputed=0 so the comparison below always
        # flags a mismatch when the client submits an inflated score. This check
        # lives here, not in recompute_total_score, to keep the canonical formula
        # intact for parity testing between Python/WASM/JS.
        if (session.kill_value or 0) > 0 and session.cost_total == 0:
            logger.warning(
                "impossible_submission cost_total=0 kill_value=%s session=%s; forcing recomputed=0",
                session.kill_value, session.id,
            )
            recomputed = 0.0
        else:
            recomputed = recompute_total_score(
                kill_value=session.kill_value,
                time_total=time_total,
                time_exclude_prepare=time_exclude_prepare,
                cost_total=session.cost_total,
                health_origin=session.health_origin,
                health_final=session.health_final,
                initial_answer=session.initial_answer,
                pow_fn=get_pow_fn(),
                total_score_fn=get_total_score_fn(),
            )
        if recomputed is None:
            if session.total_score is not None:
                logger.warning(
                    "total_score submitted but V2 fields incomplete session=%s; discarding client value",
                    session.id,
                )
            # M6: always clear the client value when we cannot compute a
            # server-authoritative score — not only when the client happened
            # to submit one. The server wins unconditionally.
            session.override_total_score(None)
            return
        submitted = session.total_score
        if submitted is not None:
            replay_version = getattr(session, "replay_version", 1) or 1
            # B-BUG-15: fail closed on v2 when the WASM runtime is missing.
            # Falling back to Python pow at the v1 ε would silently weaken
            # v2's bit-equal acceptance contract; instead we surface 503 so
            # the operator sees the misconfiguration and the client retries.
            if replay_version >= 2 and not is_wasm_loaded():
                logger.error(
                    "replay_unavailable v2 session=%s wasm_runtime not loaded",
                    session.id,
                )
                raise ReplayUnavailableError()
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

    def _abandon_and_commit(self, session: GameSession) -> None:
        session.abandon()
        self._session_repo.save(session)
        self._uow.commit()
