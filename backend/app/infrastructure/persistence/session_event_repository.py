"""SQLAlchemy implementation of ReplayEventRepository (Backlog §24)."""
from __future__ import annotations

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session as DbSession

from app.domain.session.events_log import ReplayEvent
from app.models.session_event import SessionEvent


class SqlAlchemySessionEventRepository:
    """Append-only ingest + ordered read for session events.

    Insert path uses ``ON CONFLICT (session_id, seq) DO NOTHING`` so a
    retried batch is idempotent: the (session_id, seq) unique index
    short-circuits duplicates without raising. The return value is the
    number of NEW rows so callers can detect a partial-retry mismatch.
    """

    def __init__(self, db: DbSession) -> None:
        self._db = db

    def append_batch(self, session_id: str, events: list[ReplayEvent]) -> int:
        if not events:
            return 0
        rows = [
            {
                "session_id": session_id,
                "seq": e.seq,
                "ts": e.ts,
                "event_type": e.event_type,
                "payload": e.payload,
            }
            for e in events
        ]
        # PostgreSQL-specific INSERT...ON CONFLICT keeps idempotency cheap.
        # If we ever support SQLite again for tests, swap to a per-row
        # try/except — but the test suite is PG-backed (see conftest.py).
        stmt = pg_insert(SessionEvent).values(rows)
        stmt = stmt.on_conflict_do_nothing(
            index_elements=["session_id", "seq"],
        )
        result = self._db.execute(stmt)
        self._db.flush()
        return result.rowcount or 0

    def count_for_session(self, session_id: str) -> int:
        return self._db.scalar(
            select(func.count(SessionEvent.id)).where(
                SessionEvent.session_id == session_id,
            )
        ) or 0

    def list_for_session(self, session_id: str) -> list[ReplayEvent]:
        rows = self._db.execute(
            select(SessionEvent)
            .where(SessionEvent.session_id == session_id)
            .order_by(SessionEvent.seq.asc())
        ).scalars().all()
        return [
            ReplayEvent(
                seq=r.seq,
                ts=r.ts,
                event_type=r.event_type,
                payload=r.payload,
            )
            for r in rows
        ]
