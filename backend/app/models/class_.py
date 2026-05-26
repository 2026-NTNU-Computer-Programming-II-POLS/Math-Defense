import uuid
from datetime import datetime, UTC
from sqlalchemy import (
    CheckConstraint, String, DateTime, ForeignKey, Index, UniqueConstraint, Integer,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class Class(Base):
    __tablename__ = "classes"
    __table_args__ = (
        UniqueConstraint("join_code", name="uq_classes_join_code"),
        UniqueConstraint("teacher_id", "name", name="uq_classes_teacher_name"),
        # Ensures join_code is always stored upper-case; guards against manual edits
        # that would silently break find_by_join_code lookups.
        CheckConstraint("join_code = upper(join_code)", name="ck_classes_join_code_upper"),
        CheckConstraint(
            "capacity IS NULL OR capacity > 0", name="ck_classes_capacity_positive",
        ),
        Index("ix_classes_teacher_id", "teacher_id"),
        Index("ix_classes_archived_at", "archived_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    teacher_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False,
    )
    join_code: Mapped[str] = mapped_column(String(8), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
    # Soft-delete + metadata fields (audit Tier-C M1 / O8).
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    subject: Mapped[str | None] = mapped_column(String(80), nullable=True)
    school_year: Mapped[str | None] = mapped_column(String(40), nullable=True)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True,
    )
