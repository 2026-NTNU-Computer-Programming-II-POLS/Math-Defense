"""SessionEvent ORM model — append-only event log for Replay/Spectate (§24).

Each row captures a single GameEvent emitted on the frontend EventBus during
a live session. The replay player streams these rows back through a stand-in
EventBus to reconstruct the run.

Design notes:
* ``seq`` is assigned by the recorder client-side, not the server, so a batch
  of events that arrives at the server out of order still replays in the
  exact order it fired in the live engine. Unique on ``(session_id, seq)`` to
  let the recorder retry a flush idempotently.
* ``ts`` is **game-time** (seconds since startLevel), not wall-clock — the
  determinism contract requires all time-dependent logic to read game.time.
* ``payload`` is JSONB so the column is queryable and indexable in PG; the
  shape is the GameEvents map on the frontend (one shape per event_type).
* No FK from event_type to a lookup table: event types are versioned with
  the frontend bundle, not the database, so we'd be paying for a join
  without gaining a constraint that catches anything real.
"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import (
    BigInteger,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class SessionEvent(Base):
    __tablename__ = "session_events"
    __table_args__ = (
        UniqueConstraint("session_id", "seq", name="uq_session_event_seq"),
        Index("ix_session_event_session_id", "session_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("game_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    ts: Mapped[float] = mapped_column(Float, nullable=False)
    event_type: Mapped[str] = mapped_column(String(64), nullable=False)
    payload: Mapped[dict | list | str | int | float | bool | None] = mapped_column(
        JSONB, nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
