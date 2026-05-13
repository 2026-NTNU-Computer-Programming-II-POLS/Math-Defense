"""v2 grabbing territory tables

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa

revision = "d4e5f6a7b8c9"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "grabbing_territory_activities",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("class_id", sa.String(), nullable=True),
        sa.Column("teacher_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.Column("settled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["teacher_id"], ["users.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_gt_activities_teacher_id", "grabbing_territory_activities", ["teacher_id"])
    op.create_index("ix_gt_activities_class_id", "grabbing_territory_activities", ["class_id"])
    op.create_index("ix_gt_activities_deadline", "grabbing_territory_activities", ["deadline"])

    op.create_table(
        "territory_slots",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("activity_id", sa.String(), nullable=False),
        sa.Column("star_rating", sa.Integer(), nullable=False),
        sa.Column("path_config", sa.JSON(), nullable=True),
        sa.Column("slot_index", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["activity_id"], ["grabbing_territory_activities.id"], ondelete="CASCADE"),
        sa.CheckConstraint("star_rating BETWEEN 1 AND 5", name="ck_territory_slot_star_range"),
        sa.CheckConstraint("slot_index >= 0", name="ck_territory_slot_index_nonneg"),
    )
    op.create_index("ix_territory_slots_activity_id", "territory_slots", ["activity_id"])

    op.create_table(
        "territory_occupations",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("slot_id", sa.String(), nullable=False),
        sa.Column("student_id", sa.String(), nullable=False),
        sa.Column("score", sa.Float(), nullable=False),
        sa.Column("occupied_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["slot_id"], ["territory_slots.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("slot_id", name="uq_territory_occupation_slot"),
    )
    op.create_index("ix_territory_occupations_student_id", "territory_occupations", ["student_id"])
    op.create_index("ix_territory_occupations_slot_id", "territory_occupations", ["slot_id"])


def downgrade() -> None:
    op.drop_table("territory_occupations")
    op.drop_table("territory_slots")
    op.drop_table("grabbing_territory_activities")
