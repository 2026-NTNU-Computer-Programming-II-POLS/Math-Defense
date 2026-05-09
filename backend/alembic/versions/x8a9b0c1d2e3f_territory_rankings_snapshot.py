"""territory rankings snapshot table + (student_id, slot_id) index

Revision ID: x8a9b0c1d2e3f
Revises: w7f8a9b0c1d2
Create Date: 2026-05-09

Adds:
- A composite index ``ix_territory_occupations_student_slot`` to support
  per-student, per-slot lookups during ranking aggregation (replaces the
  invalid ``(student_id, activity_id)`` shape — the table has no
  ``activity_id`` column; ``slot_id`` reaches it via territory_slots).
- A ``territory_rankings_snapshot`` table that captures (rank,
  territory_value) per student per activity at settle time so the
  ranking endpoint can compute rank deltas without a periodic worker.
"""
import sqlalchemy as sa
from alembic import op


revision = "x8a9b0c1d2e3f"
down_revision = "w7f8a9b0c1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_territory_occupations_student_slot",
        "territory_occupations",
        ["student_id", "slot_id"],
    )
    op.create_table(
        "territory_rankings_snapshot",
        sa.Column("id", sa.String, primary_key=True),
        sa.Column(
            "activity_id",
            sa.String,
            sa.ForeignKey("grabbing_territory_activities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "student_id",
            sa.String,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("territory_value", sa.Float, nullable=False),
        sa.Column("rank", sa.Integer, nullable=False),
        sa.Column(
            "snapshot_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_snap_activity_time",
        "territory_rankings_snapshot",
        ["activity_id", "snapshot_at"],
    )
    op.create_index(
        "ix_snap_activity_student_time",
        "territory_rankings_snapshot",
        ["activity_id", "student_id", "snapshot_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_snap_activity_student_time", table_name="territory_rankings_snapshot")
    op.drop_index("ix_snap_activity_time", table_name="territory_rankings_snapshot")
    op.drop_table("territory_rankings_snapshot")
    op.drop_index("ix_territory_occupations_student_slot", table_name="territory_occupations")
