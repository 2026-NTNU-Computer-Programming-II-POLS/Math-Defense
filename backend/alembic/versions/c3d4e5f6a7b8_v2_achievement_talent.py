"""v2 achievement and talent tables

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_achievements",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("achievement_id", sa.String(100), nullable=False),
        sa.Column("talent_points", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )
    op.create_index("ix_user_achievement_user_id", "user_achievements", ["user_id"])

    op.create_table(
        "talent_allocations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("talent_node_id", sa.String(100), nullable=False),
        sa.Column("current_level", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "talent_node_id", name="uq_user_talent_node"),
    )
    op.create_index("ix_talent_allocation_user_id", "talent_allocations", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_talent_allocation_user_id", table_name="talent_allocations")
    op.drop_table("talent_allocations")
    op.drop_index("ix_user_achievement_user_id", table_name="user_achievements")
    op.drop_table("user_achievements")
