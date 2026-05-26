import uuid
from datetime import datetime, UTC
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class ClassCoTeacher(Base):
    __tablename__ = "class_co_teachers"
    __table_args__ = (
        UniqueConstraint("class_id", "teacher_id", name="uq_class_co_teachers_class_teacher"),
        Index("ix_class_co_teachers_class_id", "class_id"),
        Index("ix_class_co_teachers_teacher_id", "teacher_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id: Mapped[str] = mapped_column(
        String, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
    )
    teacher_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    added_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
