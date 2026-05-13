"""ORM model — Pedagogical_Backlog_Spec.md §8.

One row per (user, competency). The composite primary key matches the access
pattern in ``SqlAlchemyCompetencyStateRepository`` (find-by-user is one
indexed scan; upserts target the natural key directly) and removes the need
for a synthetic id column.
"""
from datetime import datetime, UTC

from sqlalchemy import DateTime, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class UserCompetencyState(Base):
    __tablename__ = "user_competency_state"

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    competency: Mapped[str] = mapped_column(String(32), primary_key=True)
    alpha: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    beta: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
