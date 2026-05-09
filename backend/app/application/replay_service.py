"""ReplayApplicationService — record + read the per-session event log.

Pedagogical Backlog §24 (Replay / Spectate Mode).

The service is deliberately thin: ingest validates ownership + per-session
quota, then delegates to the repository; read returns the seed + ordered
event list. Score / scoring-context belong to SessionApplicationService and
stay there; this service only owns the input / event stream.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from app.domain.errors import (
    DomainValueError,
    SessionNotActiveError,
    SessionNotFoundError,
)
from app.domain.session.events_log import (
    MAX_BATCH_SIZE,
    MAX_EVENTS_PER_SESSION,
    ReplayEvent,
)
from app.domain.value_objects import SessionStatus

if TYPE_CHECKING:
    from app.application.ports import UnitOfWork
    from app.domain.session.events_log import ReplayEventRepository
    from app.domain.session.repository import GameSessionRepository


@dataclass(frozen=True)
class ReplayBundle:
    """Read-side projection: everything a player needs to re-drive the engine.

    ``rng_seed`` may be ``None`` for legacy sessions that pre-date §24 — the
    Replay UI gracefully degrades by warning the user that randomness will
    diverge, while still scrubbing through the deterministic events."""
    session_id: str
    rng_seed: int | None
    # 施工計畫書 §3.8 — replay protocol version (1 = legacy, 2 = bit-exact WASM).
    replay_version: int
    star_rating: int
    events: list[ReplayEvent]


class ReplayApplicationService:
    def __init__(
        self,
        session_repo: "GameSessionRepository",
        event_repo: "ReplayEventRepository",
        uow: "UnitOfWork",
    ) -> None:
        self._session_repo = session_repo
        self._event_repo = event_repo
        self._uow = uow

    def append_events(
        self,
        session_id: str,
        user_id: str,
        events: list[ReplayEvent],
    ) -> int:
        """Persist a batch of events emitted by a live session.

        Enforces:
          * Ownership — session must belong to ``user_id``.
          * Batch size — caller can't exceed ``MAX_BATCH_SIZE`` per request.
          * Per-session cap — total events must not exceed
            ``MAX_EVENTS_PER_SESSION``. The check is best-effort: a flood
            of concurrent batches could race past the cap by a small
            margin, but the cap is generous enough that this is benign.

        Returns the number of NEW rows written (idempotent on (session_id,
        seq) — a retried batch returns 0 without raising).
        """
        if not events:
            return 0
        if len(events) > MAX_BATCH_SIZE:
            raise DomainValueError(
                f"event batch exceeds max size {MAX_BATCH_SIZE}"
            )
        with self._uow:
            session = self._session_repo.find_by_id(session_id, user_id)
            if session is None:
                raise SessionNotFoundError("Session not found")
            # B-BUG-7: only ACTIVE sessions accept new replay events.
            # Without this, the owner could splice forged events into a
            # COMPLETED or ABANDONED session and have them streamed back to
            # spectators / replayers as if they were part of the original
            # run.
            if session.status != SessionStatus.ACTIVE:
                raise SessionNotActiveError(
                    "Cannot append events to a non-active session"
                )
            existing = self._event_repo.count_for_session(session_id)
            if existing + len(events) > MAX_EVENTS_PER_SESSION:
                raise DomainValueError(
                    f"session event log would exceed cap "
                    f"({MAX_EVENTS_PER_SESSION})"
                )
            # B-BUG-7: every seq in the batch must strictly exceed the
            # current max already on disk. The (session_id, seq) unique
            # index alone is insufficient: it stops exact replay of the
            # same seq, but accepts a tampered batch that interleaves
            # fresh-but-stale numbers (e.g. seq=5 when seq=10 is the latest
            # legitimate event).
            current_max = self._event_repo.max_seq_for_session(session_id)
            min_incoming = min(e.seq for e in events)
            if min_incoming <= current_max:
                raise DomainValueError(
                    f"event seq {min_incoming} is not strictly greater "
                    f"than recorded max {current_max}"
                )
            written = self._event_repo.append_batch(session_id, events)
            self._uow.commit()
            return written

    def authorize_spectator(self, session_id: str, user_id: str) -> None:
        """Owner-only spectator authorization. Raises SessionNotFoundError
        when the session does not exist or does not belong to the requesting
        user. Routers must call this before opening a spectate WS rather
        than running their own ORM query."""
        session = self._session_repo.find_by_id(session_id, user_id)
        if session is None:
            raise SessionNotFoundError("Session not found")

    def get_replay(self, session_id: str, user_id: str) -> ReplayBundle:
        """Read-side: return the seed + full event stream for a session.

        Ownership-scoped: a user can only replay their own sessions. (A
        future spectator role would relax this gate via a separate method.)
        """
        session = self._session_repo.find_by_id(session_id, user_id)
        if session is None:
            raise SessionNotFoundError("Session not found")
        events = self._event_repo.list_for_session(session_id)
        return ReplayBundle(
            session_id=session.id,
            rng_seed=getattr(session, "rng_seed", None),
            replay_version=getattr(session, "replay_version", 1) or 1,
            star_rating=int(session.level),
            events=events,
        )
