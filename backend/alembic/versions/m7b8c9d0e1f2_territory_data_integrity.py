"""territory data integrity: slot uniqueness + settlement audit trail

Revision ID: m7b8c9d0e1f2
Revises: l6a7b8c9d0e1
Create Date: 2026-05-02

B-M-7: add settled_at / settled_by columns to grabbing_territory_activities
  so every settlement has an audit trail (who triggered it and when).
B-M-8: add unique constraint on territory_slots(activity_id, slot_index)
  to prevent duplicate slot positions per activity.
"""
import sqlalchemy as sa
from alembic import op

revision = "m7b8c9d0e1f2"
down_revision = "l6a7b8c9d0e1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # B-M-7: settlement audit trail
    op.add_column(
        "grabbing_territory_activities",
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "grabbing_territory_activities",
        sa.Column("settled_by", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_gt_activities_settled_by",
        "grabbing_territory_activities",
        "users",
        ["settled_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # B-M-8: slot index uniqueness per activity
    op.create_unique_constraint(
        "uq_territory_slot_activity_index",
        "territory_slots",
        ["activity_id", "slot_index"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_territory_slot_activity_index",
        "territory_slots",
        type_="unique",
    )
    op.drop_constraint(
        "fk_gt_activities_settled_by",
        "grabbing_territory_activities",
        type_="foreignkey",
    )
    op.drop_column("grabbing_territory_activities", "settled_by")
    op.drop_column("grabbing_territory_activities", "settled_at")
