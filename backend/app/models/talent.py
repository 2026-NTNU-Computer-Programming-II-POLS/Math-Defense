import uuid
from datetime import datetime, UTC
from sqlalchemy import String, Integer, DateTime, ForeignKey, Index, UniqueConstraint, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class TalentAllocation(Base):
    __tablename__ = "talent_allocations"
    __table_args__ = (
        UniqueConstraint("user_id", "talent_node_id", name="uq_user_talent_node"),
        CheckConstraint("current_level >= 1", name="ck_talent_level_min"),
        Index("ix_talent_allocation_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    talent_node_id: Mapped[str] = mapped_column(String(100), nullable=False)
    current_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
