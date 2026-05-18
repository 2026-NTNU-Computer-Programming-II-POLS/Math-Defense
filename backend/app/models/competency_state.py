"""ORM model — Pedagogical_Backlog_Spec.md §8.

One row per (user, competency). The composite primary key matches the access
pattern in ``SqlAlchemyCompetencyStateRepository`` (find-by-user is one
indexed scan; upserts target the natural key directly) and removes the need
for a synthetic id column.
"""
from datetime import datetime, UTC

from sqlalchemy import CheckConstraint, DateTime, Float, ForeignKey, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class UserCompetencyState(Base):
    __tablename__ = "user_competency_state"
    __table_args__ = (
        CheckConstraint("alpha > 0", name="ck_competency_alpha_positive"),
        CheckConstraint("beta > 0", name="ck_competency_beta_positive"),
    )

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
        server_onupdate=text("CURRENT_TIMESTAMP"),
    )
