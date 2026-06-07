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
        CheckConstraint(
            "student_slot_cap BETWEEN 1 AND 50",
            name="ck_gt_activity_student_slot_cap_range",
        ),
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
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    settled_by: Mapped[str | None] = mapped_column(
        String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True,
    )
    student_slot_cap: Mapped[int] = mapped_column(
        Integer, default=5, server_default="5", nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )


class TerritorySlot(Base):
    __tablename__ = "territory_slots"
    __table_args__ = (
        Index("ix_territory_slots_activity_id", "activity_id"),
        CheckConstraint("star_rating BETWEEN 1 AND 5", name="ck_territory_slot_star_range"),
        CheckConstraint("slot_index BETWEEN 0 AND 49", name="ck_territory_slot_index_range"),
        UniqueConstraint("activity_id", "slot_index", name="uq_territory_slot_activity_index"),
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
        # Created by migration x8a9b0c1d2e3f to back per-student/per-slot ranking
        # aggregation. Declared here too so `alembic revision --autogenerate`
        # does not emit a spurious DROP INDEX against the live schema.
        Index("ix_territory_occupations_student_slot", "student_id", "slot_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    slot_id: Mapped[str] = mapped_column(
        String, ForeignKey("territory_slots.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    score: Mapped[float] = mapped_column(Float, nullable=False)
    session_id: Mapped[str | None] = mapped_column(
        String,
        ForeignKey("game_sessions.id", ondelete="SET NULL"),
        nullable=True,
    )
    occupied_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )


class TerritoryRankingsSnapshot(Base):
    """Point-in-time ranking record per (activity, student).

    Written at settle time (and any future scheduled cadence) so the
    rankings endpoint can compute rank deltas against the most recent
    prior snapshot. Older snapshots are retained for historical queries.
    """
    __tablename__ = "territory_rankings_snapshot"
    __table_args__ = (
        Index("ix_snap_activity_time", "activity_id", "snapshot_at"),
        Index("ix_snap_activity_student_time", "activity_id", "student_id", "snapshot_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    activity_id: Mapped[str] = mapped_column(
        String, ForeignKey("grabbing_territory_activities.id", ondelete="CASCADE"), nullable=False,
    )
    student_id: Mapped[str] = mapped_column(
        String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False,
    )
    territory_value: Mapped[float] = mapped_column(Float, nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshot_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC),
    )


class TerritorySessionUse(Base):
    """Durable record of every session_id consumed for territory captures.

    Kept separate from territory_occupations so displaced occupations (which
    are deleted on counter-seize) cannot un-mark a session as used.
    """
    __tablename__ = "territory_session_uses"

    session_id: Mapped[str] = mapped_column(
        # ON DELETE CASCADE: GameSession.user_id cascades from users, so a
        # RESTRICT here would block deleting any user who ever captured
        # territory. Once the game_session row itself is gone there is no
        # rng_seed / session_events left to replay, so the use-record has
        # nothing left to protect.
        String, ForeignKey("game_sessions.id", ondelete="CASCADE"), primary_key=True,
    )
