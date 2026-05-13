"""SpectateHub — in-process pub/sub for live session events (§24 Phase D).

Single-process fan-out: spectators subscribed to a session id receive every
event the session's owner posts to ``POST /api/sessions/{id}/events``.

Why in-process and not Redis pub/sub?
    The educational deployment runs single-instance; spectator load is
    bounded by classroom size (≤ 30 viewers per session). An in-memory
    asyncio.Queue per subscriber is the simplest correct primitive for
    that scale. When/if we scale to multiple workers, replace the
    backing store with Redis pub/sub and keep this surface area.

Backpressure: each subscriber owns a bounded queue. A slow client whose
queue fills is dropped — better to lose one viewer than block the
publisher (which holds a request thread when called from the HTTP
ingest path).
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

# Per-subscriber buffer. 256 events is enough for a few seconds of live
# play even at peak (TOWER_PLACED, BUFF_CARD_SELECTED etc fire on player
# input, ~1-10/s on average). A backlog beyond that means the spectator
# can't keep up; we drop them rather than memory-bloat.
_SUBSCRIBER_QUEUE_SIZE = 256


class SpectateHub:
    """One instance lives on app.state, shared across requests."""

    def __init__(self) -> None:
        # session_id -> set of subscriber queues
        self._subs: dict[str, set[asyncio.Queue]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, session_id: str) -> asyncio.Queue:
        """Register a new subscriber. Returns a queue the caller drains
        in a loop. Caller MUST call ``unsubscribe`` (or use ``subscription``
        context manager) on disconnect."""
        q: asyncio.Queue = asyncio.Queue(maxsize=_SUBSCRIBER_QUEUE_SIZE)
        async with self._lock:
            self._subs.setdefault(session_id, set()).add(q)
        return q

    async def unsubscribe(self, session_id: str, q: asyncio.Queue) -> None:
        async with self._lock:
            subs = self._subs.get(session_id)
            if subs is None:
                return
            subs.discard(q)
            if not subs:
                self._subs.pop(session_id, None)

    async def publish(self, session_id: str, events: list[dict[str, Any]]) -> None:
        """Fan out a batch to every subscriber of ``session_id``.

        Sends each event individually (not the batch) so spectators
        receive a fine-grained stream and the EventPlayer-style consumer
        can dispatch one at a time. A subscriber whose queue is full is
        unsubscribed — in pedagogical terms, a dropped viewer can rejoin;
        a stalled publisher would freeze the recorder.
        """
        async with self._lock:
            subs = list(self._subs.get(session_id, ()))
        if not subs:
            return
        dropped: list[asyncio.Queue] = []
        for ev in events:
            for q in subs:
                try:
                    q.put_nowait(ev)
                except asyncio.QueueFull:
                    dropped.append(q)
                    logger.info(
                        "spectate hub: dropped slow subscriber on session=%s",
                        session_id,
                    )
        if dropped:
            async with self._lock:
                bucket = self._subs.get(session_id)
                if bucket is not None:
                    for q in dropped:
                        bucket.discard(q)


# Module-level singleton — referenced by both the ingest path (publish) and
# the WebSocket route (subscribe). Tests can monkey-patch this attribute or
# use the per-test fixture in conftest to swap in a fresh hub.
hub = SpectateHub()
