"""membership lifecycle fixes: removed_class_memberships, teacher FK RESTRICT, user is_active

Revision ID: i3d4e5f6a7b8
Revises: h2c3d4e5f6a7
Create Date: 2026-05-02

A-21: territory occupations cleaned up in application layer (no schema change needed)
A-22: add removed_class_memberships table for re-join blocklist
A-23: change classes.teacher_id FK from CASCADE to RESTRICT
A-24: add users.is_active boolean column
"""
from alembic import op
import sqlalchemy as sa

revision = "i3d4e5f6a7b8"
down_revision = "h2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A-24: add is_active to users
    op.add_column("users", sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"))

    # A-23: change teacher_id FK from CASCADE to RESTRICT
    op.drop_constraint("classes_teacher_id_fkey", "classes", type_="foreignkey")
    op.create_foreign_key(
        "classes_teacher_id_fkey", "classes", "users",
        ["teacher_id"], ["id"],
        ondelete="RESTRICT",
    )

    # A-22: removed_class_memberships table
    op.create_table(
        "removed_class_memberships",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("class_id", sa.String(), nullable=False),
        sa.Column("student_id", sa.String(), nullable=False),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["class_id"], ["classes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["student_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("class_id", "student_id", name="uq_removed_memberships_class_student"),
    )
    op.create_index("ix_removed_memberships_student_id", "removed_class_memberships", ["student_id"])


def downgrade() -> None:
    op.drop_index("ix_removed_memberships_student_id", table_name="removed_class_memberships")
    op.drop_table("removed_class_memberships")

    op.drop_constraint("classes_teacher_id_fkey", "classes", type_="foreignkey")
    op.create_foreign_key(
        "classes_teacher_id_fkey", "classes", "users",
        ["teacher_id"], ["id"],
        ondelete="CASCADE",
    )

    op.drop_column("users", "is_active")
