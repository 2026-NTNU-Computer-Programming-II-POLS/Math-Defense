import uuid
from datetime import datetime, UTC
from sqlalchemy import String, Integer, Float, Boolean, DateTime, ForeignKey, Index, CheckConstraint, text, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base
from app.domain.value_objects import SessionStatus


class GameSession(Base):
    __tablename__ = "game_sessions"
    __table_args__ = (
        Index("ix_game_session_user_id", "user_id"),
        Index(
            "uq_one_active_per_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'active'"),
        ),
        CheckConstraint("star_rating BETWEEN 1 AND 5", name="ck_game_session_star_range"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    star_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    path_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    initial_answer: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(
        SAEnum(SessionStatus, values_callable=lambda e: [m.value for m in e]),
        default=SessionStatus.ACTIVE.value,
    )
    current_wave: Mapped[int] = mapped_column(Integer, default=0)
    gold: Mapped[int] = mapped_column(Integer, default=200)
    hp: Mapped[int] = mapped_column(Integer, default=20)
    score: Mapped[int] = mapped_column(Integer, default=0)
    kills: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    waves_survived: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kill_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_total: Mapped[float | None] = mapped_column(Float, nullable=True)
    cost_total: Mapped[int | None] = mapped_column(Integer, nullable=True)
    health_origin: Mapped[int | None] = mapped_column(Integer, nullable=True)
    health_final: Mapped[int | None] = mapped_column(Integer, nullable=True)
    time_exclude_prepare: Mapped[list | None] = mapped_column(JSON, nullable=True)
    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
