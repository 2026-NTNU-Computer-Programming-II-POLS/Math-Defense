import uuid
from datetime import datetime, UTC
from sqlalchemy import String, Integer, DateTime, ForeignKey, Index, CheckConstraint, text, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base
from app.domain.value_objects import SessionStatus


class GameSession(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (
        Index("ix_game_session_user_id", "user_id"),
        # Each user can have at most one active session at a time (enforced at DB level)
        Index(
            "uq_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        CheckConstraint("level BETWEEN 1 AND 4", name="ck_game_session_level_range"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(
        SAEnum(SessionStatus, values_callable=lambda e: [m.value for m in e]),
        default=SessionStatus.ACTIVE.value,
    )
    current_wave: Mapped[int] = mapped_column(Integer, default=0)
    gold: Mapped[int] = mapped_column(Integer, default=200)
    hp: Mapped[int] = mapped_column(Integer, default=20)
    score: Mapped[int] = mapped_column(Integer, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
