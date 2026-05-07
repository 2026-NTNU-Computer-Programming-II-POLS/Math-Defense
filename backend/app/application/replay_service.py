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
    SessionNotFoundError,
)
from app.domain.session.events_log import (
    MAX_BATCH_SIZE,
    MAX_EVENTS_PER_SESSION,
    ReplayEvent,
)

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
            existing = self._event_repo.count_for_session(session_id)
            if existing + len(events) > MAX_EVENTS_PER_SESSION:
                raise DomainValueError(
                    f"session event log would exceed cap "
                    f"({MAX_EVENTS_PER_SESSION})"
                )
            written = self._event_repo.append_batch(session_id, events)
            self._uow.commit()
            return written

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
            star_rating=int(session.level),
            events=events,
        )
