"""add student_slot_cap to grabbing_territory_activities

Revision ID: ee5f6a7b8c9d
Revises: dd4e5f6a7b8c
Create Date: 2026-05-28

Surfaces the previously hard-coded per-student occupation cap
(TERRITORY_CAP_PER_STUDENT = 5) as a teacher-configurable, per-activity
column. Default of 5 preserves existing behaviour for backfilled rows.

CHECK 1..50 mirrors the schema-layer bound on CreateActivityRequest so the
two layers can't drift.
"""
import sqlalchemy as sa
from alembic import op


revision = "ee5f6a7b8c9d"
down_revision = "dd4e5f6a7b8c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "grabbing_territory_activities",
        sa.Column(
            "student_slot_cap",
            sa.Integer(),
            nullable=False,
            server_default="5",
        ),
    )
    op.create_check_constraint(
        "ck_gt_activity_student_slot_cap_range",
        "grabbing_territory_activities",
        "student_slot_cap BETWEEN 1 AND 50",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_gt_activity_student_slot_cap_range",
        "grabbing_territory_activities",
        type_="check",
    )
    op.drop_column("grabbing_territory_activities", "student_slot_cap")
