import uuid
from datetime import datetime, UTC
from sqlalchemy import (
    String, Integer, Float, DateTime, ForeignKey, Boolean,
    Index, UniqueConstraint, CheckConstraint, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.db.database import Base


class GrabbingTerritoryActivity(Base):
    __tablename__ = "grabbing_territory_activities"
    __table_args__ = (
        Index("ix_gt_activities_teacher_id", "teacher_id"),
        Index("ix_gt_activities_class_id", "class_id"),
        Index("ix_gt_activities_deadline", "deadline"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    class_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("classes.id", ondelete="CASCADE"), nullable=True,
    )
    teacher_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    settled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )


class TerritorySlot(Base):
    __tablename__ = "territory_slots"
    __table_args__ = (
        Index("ix_territory_slots_activity_id", "activity_id"),
        CheckConstraint("star_rating BETWEEN 1 AND 5", name="ck_territory_slot_star_range"),
        CheckConstraint("slot_index >= 0", name="ck_territory_slot_index_nonneg"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id: Mapped[str] = mapped_column(
        String, ForeignKey("grabbing_territory_activities.id", ondelete="CASCADE"), nullable=False,
    )
    star_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    path_config: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    slot_index: Mapped[int] = mapped_column(Integer, nullable=False)


class TerritoryOccupation(Base):
    __tablename__ = "territory_occupations"
    __table_args__ = (
        UniqueConstraint("slot_id", name="uq_territory_occupation_slot"),
        UniqueConstraint("session_id", name="uq_territory_occupation_session"),
        Index("ix_territory_occupations_student_id", "student_id"),
        Index("ix_territory_occupations_slot_id", "slot_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    slot_id: Mapped[str] = mapped_column(
        String, ForeignKey("territory_slots.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String, nullable=True)
    occupied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )
