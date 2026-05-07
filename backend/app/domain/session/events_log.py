"""Replay event-log domain model — Pedagogical Backlog §24.

Light-weight value object + repository protocol for the per-session event
stream that backs Replay/Spectate. Kept separate from the SessionCompleted
DDD events in ``session/events.py`` because those describe *aggregate*
state-transitions for the application service to subscribe to; this file
concerns the player-input + RNG-derived stream that the *engine* emits at
runtime, which is much higher cardinality and lives in its own table.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Protocol, runtime_checkable


@dataclass(frozen=True)
class ReplayEvent:
    """One recorded event from a live session.

    ``ts`` is game-time in seconds (NOT wall-clock) — the determinism
    contract requires consumers to schedule events against game.time so a
    backgrounded tab on the recording side and a different frame budget on
    the replay side both produce the same simulation.

    ``payload`` is the GameEvents map shape on the frontend, keyed by
    ``event_type``. The replay player does NOT validate the payload shape
    at decode time — the EventBus is type-safe at compile time only;
    runtime mismatches surface as system bugs in the playback view.
    """
    seq: int
    ts: float
    event_type: str
    payload: Any | None


# Hard cap on a single ingest batch. Tuned so a player firing every event
# possible across a full Star-5 wave still flushes in well under the limit;
# protects the server from a tampered client trying to dump millions of
# events per request.
MAX_BATCH_SIZE = 500

# Hard cap on the total event count per session. A typical Star-5 run
# produces ~3-5k events; this bound is high enough to never bite a
# legitimate player and low enough that a misbehaving client can't fill
# the table.
MAX_EVENTS_PER_SESSION = 50_000


@runtime_checkable
class ReplayEventRepository(Protocol):
    def append_batch(self, session_id: str, events: list[ReplayEvent]) -> int:
        """Insert events for ``session_id``, returning the count actually
        written. Idempotent on the (session_id, seq) unique constraint —
        re-flushing the same batch returns 0 written without raising.

        Returns the number of NEW rows; the recorder uses this to verify
        that a retry didn't lose events to the unique-constraint short-
        circuit."""
        ...

    def count_for_session(self, session_id: str) -> int:
        """Total events recorded against this session. Used to enforce
        ``MAX_EVENTS_PER_SESSION`` server-side."""
        ...

    def list_for_session(self, session_id: str) -> list[ReplayEvent]:
        """All events for a session, ordered by ``seq`` ascending. The
        Replay player consumes this in a single batch — pagination would
        complicate the player without a real benefit at our event-count
        budget."""
        ...
