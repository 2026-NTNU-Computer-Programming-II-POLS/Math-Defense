"""ORM model for per-account login failure tracking.

Persisted so lockouts survive process restart and propagate across replicas.
Rows are keyed by username; `failures` is the count in the current window and
`window_started_at` anchors the sliding window. `locked_until` is the wall-clock
deadline when the account becomes usable again (NULL = not locked).
"""
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class LoginAttempt(Base):
    __tablename__ = "login_attempts"
    __table_args__ = (
        Index("ix_login_attempts_locked_until", "locked_until"),
    )

    username: Mapped[str] = mapped_column(String(50), primary_key=True)
    failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    window_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lockout_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
