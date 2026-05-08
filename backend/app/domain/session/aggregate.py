"""GameSession Aggregate Root — encapsulates all session invariants and state transitions"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, UTC

from app.domain.constraints import (
    GOLD_MAX, HP_MAX, MAX_SCORE_DELTA, MAX_WAVE, SCORE_MAX, TOTAL_SCORE_MAX,
    LEVEL_MAX_SCORES, LEVEL_MAX_KILLS, LEVEL_MAX_WAVES,
)
from app.domain.errors import DomainValueError, InvalidStatusTransitionError, SessionNotActiveError
from app.domain.value_objects import SessionStatus, Level, GameResult
from app.domain.session.events import (
    SessionCreated,
    SessionCompleted,
    SessionAbandoned,
    SessionUpdated,
)
from app.shared_constants import INITIAL_GOLD, INITIAL_HP


DEFAULT_STALE_CUTOFF_HOURS = 2.0

# Module-level knob so the domain does not import app.config. The bootstrap
# code (see app.main) calls ``set_stale_cutoff_hours`` at startup to forward
# the operator-configured value; tests mutate it directly in isolation.
_stale_cutoff_hours: float = DEFAULT_STALE_CUTOFF_HOURS


def set_stale_cutoff_hours(hours: float) -> None:
    """Override the global stale-session cutoff. Called from app bootstrap."""
    global _stale_cutoff_hours
    _stale_cutoff_hours = hours


def _stale_cutoff() -> timedelta:
    return timedelta(hours=_stale_cutoff_hours)

# Bounds live in domain.constraints; the aggregate enforces game rules
# (hp can't exceed maxHp, score can't decrease, wave can't jump past the max).

# Valid state transition table
_ALLOWED_TRANSITIONS: dict[SessionStatus, set[SessionStatus]] = {
    SessionStatus.ACTIVE: {SessionStatus.COMPLETED, SessionStatus.ABANDONED},
    SessionStatus.COMPLETED: set(),   # 終態
    SessionStatus.ABANDONED: set(),   # 終態
}


class GameSession:
    """
    GameSession aggregate root.

    Invariants:
    1. Only ACTIVE sessions can be updated
    2. Only ACTIVE sessions can be completed
    3. Status transitions must follow the valid transition table
    4. Completing a session emits the SessionCompleted domain event
    """

    def __init__(
        self,
        id: str,
        user_id: str,
        level: Level,
        status: SessionStatus = SessionStatus.ACTIVE,
        current_wave: int = 0,
        gold: int = INITIAL_GOLD,
        hp: int = INITIAL_HP,
        score: int = 0,
        kills: int = 0,
        waves_survived: int = 0,
        initial_answer: bool = False,
        path_config: dict | None = None,
        practice_mode: bool = False,
        challenge_id: str | None = None,
        rng_seed: int | None = None,
        replay_version: int = 1,
        started_at: datetime | None = None,
        ended_at: datetime | None = None,
    ) -> None:
        self.id = id
        self.user_id = user_id
        self.level = level
        self.status = status
        self.current_wave = current_wave
        self.gold = gold
        self.hp = hp
        self.score = score
        self.kills = kills
        self.waves_survived = waves_survived
        self.initial_answer = initial_answer
        self.path_config = path_config
        # Backlog §20: when True the run is opt-in slider-fallback / practice
        # mode and must NOT appear on the global leaderboard. Achievements and
        # talent points still award (don't punish accessibility users twice).
        self.practice_mode = practice_mode
        # Backlog §23: when set, the session was started from a teacher-authored
        # challenge. The end-session handler reads this to route the leaderboard
        # entry to the challenge-specific ranking.
        self.challenge_id = challenge_id
        # Backlog §24: per-session deterministic RNG seed (32-bit unsigned).
        # Stored at creation time so a Replay can reconstruct the exact RNG
        # stream that drove buff-disable / Monty-Hall / Radar-crit / chain-rule
        # randomness during the live run.
        self.rng_seed = rng_seed
        # 施工計畫書 §3.8 — replay protocol version. v1 = mulberry32 + JS Math.*
        # (ε = 0.0005); v2 = PCG64/32 + WASM musl (bit-exact). Default 1 so
        # callers that don't yet pass this through behave like legacy v1.
        self.replay_version = replay_version
        self.kill_value: int | None = None
        self.cost_total: int | None = None
        self.time_total: float | None = None
        self.health_origin: int | None = None
        self.health_final: int | None = None
        self.time_exclude_prepare: list[float] | None = None
        self.total_score: float | None = None
        self.started_at = started_at or datetime.now(UTC)
        self.ended_at = ended_at
        self.reflection_text: str | None = None
        self._events: list = []

    @classmethod
    def create(
        cls,
        user_id: str,
        level: Level,
        initial_answer: bool = False,
        path_config: dict | None = None,
        practice_mode: bool = False,
        challenge_id: str | None = None,
        rng_seed: int | None = None,
        replay_version: int = 1,
    ) -> GameSession:
        """Factory method — creates a new ACTIVE session"""
        session = cls(
            id=str(uuid.uuid4()),
            user_id=user_id,
            level=level,
            initial_answer=initial_answer,
            path_config=path_config,
            practice_mode=practice_mode,
            challenge_id=challenge_id,
            rng_seed=rng_seed,
            replay_version=replay_version,
        )
        session._events.append(
            SessionCreated(session_id=session.id, user_id=user_id, level=int(level))
        )
        return session

    # ── Status queries ──

    @property
    def star_rating(self) -> Level:
        return self.level

    @property
    def is_active(self) -> bool:
        return self.status == SessionStatus.ACTIVE

    @property
    def is_stale(self) -> bool:
        """Session still active after 2 hours → considered stale"""
        if not self.is_active:
            return False
        now = datetime.now(UTC)
        started = self.started_at
        # SQLite returns naive datetime; normalize to aware before comparing
        if started.tzinfo is None:
            started = started.replace(tzinfo=UTC)
        return now - started > _stale_cutoff()

    # ── Commands (state-mutating methods) ──

    def update_progress(
        self,
        current_wave: int | None = None,
        gold: int | None = None,
        hp: int | None = None,
        score: int | None = None,
        kill_value: int | None = None,
        cost_total: int | None = None,
    ) -> None:
        """Update game progress — only allowed in ACTIVE status.

        The aggregate is the AUTHORITATIVE invariant guard. Schema-layer bounds
        (app/schemas/game_session.py) exist only to give HTTP callers a 422 at
        the edge; do NOT strip the clamps / range checks below on the assumption
        that the schema already validated — non-HTTP callers (background jobs,
        tests, future gRPC entrypoints) may reach this method directly.
        Clamping here is defence-in-depth against a tampered or buggy client.
        """
        self._assert_active("Cannot update a non-active session")
        if current_wave is not None:
            if current_wave < self.current_wave:
                raise DomainValueError("current_wave must not decrease")
            self.current_wave = max(0, min(current_wave, MAX_WAVE))
        if gold is not None:
            self.gold = max(0, min(gold, GOLD_MAX))
        if hp is not None:
            self.hp = max(0, min(hp, HP_MAX))
        if score is not None:
            if score < self.score:
                raise DomainValueError("score must not decrease")
            if score - self.score > MAX_SCORE_DELTA:
                raise DomainValueError("score delta exceeds plausibility cap")
            level_cap = LEVEL_MAX_SCORES.get(int(self.level), SCORE_MAX)
            if score > level_cap:
                raise DomainValueError("score exceeds level maximum")
            self.score = score
        if kill_value is not None:
            self.kill_value = max(0, kill_value)
        if cost_total is not None:
            self.cost_total = max(0, cost_total)
        self._events.append(SessionUpdated(session_id=self.id))

    def complete(
        self,
        result: GameResult,
        wave_cap_override: int | None = None,
    ) -> None:
        """End session — transition to COMPLETED and emit domain event.

        ``wave_cap_override`` lets a challenge-mode caller (Backlog §23)
        substitute a tighter wave ceiling for the per-level default. The
        kill/score caps still derive from the session's star_rating because
        challenges run inside an existing star-rated waveset, just shorter.
        """
        self._assert_active("Session already ended, cannot resubmit")
        # Reject end-payload scores that wildly exceed the most recent in-flight score
        if result.score.value < self.score:
            raise DomainValueError("final score must not be less than last reported score")
        if result.score.value - self.score > MAX_SCORE_DELTA:
            raise DomainValueError("final score delta exceeds plausibility cap")

        # Per-level caps — reject impossible scores/kills/waves (C-02)
        level_cap = LEVEL_MAX_SCORES.get(int(self.level), SCORE_MAX)
        if result.score.value > level_cap:
            raise DomainValueError("final score exceeds level maximum")
        kill_cap = LEVEL_MAX_KILLS.get(int(self.level), 0)
        if result.kills > kill_cap:
            raise DomainValueError("kills exceed level maximum")
        wave_cap = LEVEL_MAX_WAVES.get(int(self.level), MAX_WAVE)
        if wave_cap_override is not None:
            wave_cap = min(wave_cap, wave_cap_override)
        if result.waves_survived > wave_cap:
            raise DomainValueError("waves_survived exceeds level wave count")

        self._transition_to(SessionStatus.COMPLETED)
        self.score = result.score.value
        self.kills = result.kills
        self.waves_survived = result.waves_survived
        self.ended_at = datetime.now(UTC)
        self._events.append(
            SessionCompleted(
                session_id=self.id,
                user_id=self.user_id,
                level=int(self.level),
                score=result.score.value,
                kills=result.kills,
                waves_survived=result.waves_survived,
                challenge_id=self.challenge_id,
            )
        )

    def record_scoring_context(
        self,
        *,
        kill_value: int | None = None,
        cost_total: int | None = None,
        time_total: float | None = None,
        health_origin: int | None = None,
        health_final: int | None = None,
        time_exclude_prepare: list[float] | None = None,
        total_score: float | None = None,
    ) -> None:
        """Record V2 scoring metadata after completion.

        These analytics fields are write-once supplements to the core
        GameResult; they do not participate in state-transition invariants.
        """
        if kill_value is not None:
            self.kill_value = max(0, kill_value)
        if cost_total is not None:
            self.cost_total = max(0, cost_total)
        if time_total is not None:
            self.time_total = max(0.0, time_total)
        if health_origin is not None:
            self.health_origin = max(0, min(health_origin, HP_MAX))
        if health_final is not None:
            self.health_final = max(0, min(health_final, HP_MAX))
        if time_exclude_prepare is not None:
            self.time_exclude_prepare = [max(0.0, t) for t in time_exclude_prepare]
        if total_score is not None:
            self.total_score = min(max(0.0, total_score), TOTAL_SCORE_MAX)

    def override_total_score(self, value: float | None) -> None:
        """Server-side authoritative override of total_score.

        Used by the anti-cheat pipeline after recomputing the score server-side.
        Bypasses record_scoring_context so the recomputed value is never clamped
        against the client-submitted one.
        """
        self.total_score = value

    REFLECTION_MAX_LENGTH = 2000

    def record_reflection(self, text: str) -> None:
        """Attach a post-wave reflection. Only valid after the session has ended.

        Empty / whitespace-only input is treated as a deliberate skip and
        clears any existing reflection without raising. Repeated submissions
        overwrite the previous text — the audit trail lives in the application
        layer (see SessionApplicationService.attach_reflection).
        """
        if self.status != SessionStatus.COMPLETED:
            raise SessionNotActiveError(
                "Reflection can only be recorded on a completed session"
            )
        cleaned = text.strip() if text else ""
        if len(cleaned) > self.REFLECTION_MAX_LENGTH:
            raise DomainValueError(
                f"reflection text exceeds {self.REFLECTION_MAX_LENGTH} characters"
            )
        self.reflection_text = cleaned or None

    def abandon(self) -> None:
        """Abandon session — idempotent (no-op if already ended)"""
        if not self.is_active:
            return
        self._transition_to(SessionStatus.ABANDONED)
        self.ended_at = datetime.now(UTC)
        self._events.append(SessionAbandoned(session_id=self.id))

    # ── Domain events ──

    def collect_events(self) -> list:
        """Return a snapshot of events (non-destructive); call clear_events() after successful commit"""
        return self._events.copy()

    def clear_events(self) -> None:
        """Call after UoW commit succeeds; clears processed events"""
        self._events.clear()

    # ── Internal ──

    def _assert_active(self, message: str) -> None:
        if not self.is_active:
            raise SessionNotActiveError(message)

    def _transition_to(self, new_status: SessionStatus) -> None:
        allowed = _ALLOWED_TRANSITIONS.get(self.status, set())
        if new_status not in allowed:
            raise InvalidStatusTransitionError(
                f"Invalid status transition: {self.status.value} → {new_status.value}"
            )
        self.status = new_status


# Re-export for backward compatibility with callers that import from aggregate.
__all__ = [
    "GameSession",
    "SessionNotActiveError",
    "InvalidStatusTransitionError",
    "set_stale_cutoff_hours",
    "DEFAULT_STALE_CUTOFF_HOURS",
]
