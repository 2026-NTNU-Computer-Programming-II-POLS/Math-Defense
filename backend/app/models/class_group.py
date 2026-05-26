import uuid
from datetime import datetime, UTC
from sqlalchemy import String, DateTime, ForeignKey, UniqueConstraint, Index, PrimaryKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class ClassGroup(Base):
    __tablename__ = "class_groups"
    __table_args__ = (
        UniqueConstraint("class_id", "name", name="uq_class_groups_class_name"),
        Index("ix_class_groups_class_id", "class_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id: Mapped[str] = mapped_column(
        String, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )


class ClassGroupMember(Base):
    __tablename__ = "class_group_members"
    __table_args__ = (
        PrimaryKeyConstraint("group_id", "student_id"),
        # A student may belong to at most one group per class; class_id is
        # denormalised so the constraint can fire without joining groups.
        UniqueConstraint("class_id", "student_id", name="uq_group_members_class_student"),
        Index("ix_group_members_class_id", "class_id"),
        Index("ix_group_members_student_id", "student_id"),
    )

    group_id: Mapped[str] = mapped_column(
        String, ForeignKey("class_groups.id", ondelete="CASCADE"), nullable=False,
    )
    class_id: Mapped[str] = mapped_column(
        String, ForeignKey("classes.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
