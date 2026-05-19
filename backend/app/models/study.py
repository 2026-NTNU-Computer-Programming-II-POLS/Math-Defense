"""Study ORM models — Empirical Validity Probe (Pedagogical_Backlog_Spec.md §27).

Three tables, all keyed off ``(user_id, study_id)``:

* ``study_enrollments`` — one row per (user, study) the moment the user
  starts the pre-test. Caches the deterministic group so the export query
  never has to re-derive it. ``dosage_seconds`` accumulates as the user
  plays Math Defense levels during the study window.

* ``study_probe_attempts`` — one row per probe form submission. The same
  user submits up to three forms per study (``pre`` / ``post`` / ``delay``).
  Storing item-level responses in JSONB lets us recompute the score later
  if the answer key changes without re-prompting participants.

* ``study_affect_responses`` — Likert responses for the affect surveys
  (``pre`` / ``post``). Anxiety subscale is collapsed to a single mean to
  keep the export schema flat.
"""
from __future__ import annotations

from datetime import datetime, UTC

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class StudyEnrollment(Base):
    __tablename__ = "study_enrollments"

    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    study_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Cached group label ("A" or "B"). Computed via assign_group() at the
    # moment of enrollment; persisted so the export does not have to re-run
    # the hash if the assignment rule ever changes.
    group: Mapped[str] = mapped_column(String(1), nullable=False)
    # Cumulative seconds spent in Math Defense levels during the study
    # window. Updated via SessionApplicationService when a session ends and
    # the user has an enrollment for any active study. Defaults to zero so
    # the export can SELECT without a coalesce.
    dosage_seconds: Mapped[int] = mapped_column(
        Integer, nullable=False, server_default="0", default=0,
    )
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class StudyProbeAttempt(Base):
    __tablename__ = "study_probe_attempts"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "study_id", "form", name="uq_study_probe_form",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    study_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # "pre" | "post" | "delay" — guarded at the application layer; not
    # promoted to a Postgres enum to keep migrations cheap if we add a
    # follow-up form (e.g. a 4-week retention probe).
    form: Mapped[str] = mapped_column(String(8), nullable=False)
    # Score in [0, 10]. Persisted so the export does not have to re-grade
    # against the (possibly evolving) answer key.
    score: Mapped[int] = mapped_column(Integer, nullable=False)
    # Per-item record: [{ "item_id": "...", "selected": "B", "correct": true }]
    # Stored verbatim so we can compute item-level statistics later without
    # asking participants to re-do the form.
    responses: Mapped[list] = mapped_column(JSONB, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )


class StudyAffectResponse(Base):
    __tablename__ = "study_affect_responses"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "study_id", "phase", name="uq_study_affect_phase",
        ),
    )

    id: Mapped[int] = mapped_column(
        Integer, primary_key=True, autoincrement=True,
    )
    user_id: Mapped[str] = mapped_column(
        String,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    study_id: Mapped[str] = mapped_column(String(64), nullable=False)
    # "pre" | "post"
    phase: Mapped[str] = mapped_column(String(8), nullable=False)
    # Mean of the anxiety Likert subscale (1..5). Float so rounding does
    # not bias the export.
    anxiety_mean: Mapped[float] = mapped_column(Float, nullable=False)
    # Mean of the IMI intrinsic-motivation subscale (1..5).
    motivation_mean: Mapped[float] = mapped_column(Float, nullable=False)
    # Raw item-level Likert ratings, to enable subscale recomputation later.
    responses: Mapped[dict] = mapped_column(JSONB, nullable=False)
    submitted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(UTC),
    )
