import uuid
from datetime import datetime, UTC
from sqlalchemy import String, Integer, Float, DateTime, ForeignKey, UniqueConstraint, Index, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class LeaderboardEntry(Base):
    __tablename__ = "leaderboard_entries"
    __table_args__ = (
        UniqueConstraint("session_id", name="uq_leaderboard_session_id"),
        Index("ix_leaderboard_user_id", "user_id"),
        Index("ix_leaderboard_level_score", "level", "score"),
        Index("ix_leaderboard_score", "score"),
        Index("ix_leaderboard_created_at", "created_at"),
        Index("ix_leaderboard_challenge_id", "challenge_id"),
        CheckConstraint("level BETWEEN 1 AND 5", name="ck_leaderboard_level_range"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    kills: Mapped[int] = mapped_column(Integer, nullable=False)
    waves_survived: Mapped[int] = mapped_column(Integer, nullable=False)
    # M-02: V3 floating-point total_score (kill_value/time/efficiency/health factors).
    # Rankings prefer this when available, falling back to raw score for older entries.
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    session_id: Mapped[str | None] = mapped_column(String, ForeignKey("game_sessions.id", ondelete="SET NULL"), nullable=True)
    # Backlog §23 — non-NULL when entry comes from a challenge run; queried via
    # query_ranked_by_challenge so global / per-level leaderboards still work.
    # B-BUG-4: CASCADE — when a challenge is deleted, its (potentially
    # uncapped or wave-restricted) leaderboard entries must be removed too.
    # Previously SET NULL caused those entries to fall back into the global
    # ranking, where they polluted standings with scores that bypassed the
    # normal per-level invariants. Cascading the delete keeps challenge runs
    # contained to their challenge ranking.
    challenge_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("challenges.id", ondelete="CASCADE"), nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
