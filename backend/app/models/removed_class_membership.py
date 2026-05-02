import uuid
from datetime import datetime, UTC
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class RemovedClassMembership(Base):
    __tablename__ = "removed_class_memberships"
    __table_args__ = (
        UniqueConstraint("class_id", "student_id", name="uq_removed_memberships_class_student"),
        Index("ix_removed_memberships_student_id", "student_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id: Mapped[str] = mapped_column(
        String, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    removed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
