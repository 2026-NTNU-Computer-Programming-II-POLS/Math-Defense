"""unique (teacher_id, name) on classes

Revision ID: j4e5f6a7b8c9
Revises: i3d4e5f6a7b8
Create Date: 2026-05-02

A-25: prevent a teacher from creating duplicate class names.
join_code column is already VARCHAR(8) from the v2 foundation migration;
no column-size change needed for the 8-char code switch (A-26).
"""
from alembic import op

revision = "j4e5f6a7b8c9"
down_revision = "i3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_unique_constraint("uq_classes_teacher_name", "classes", ["teacher_id", "name"])


def downgrade() -> None:
    op.drop_constraint("uq_classes_teacher_name", "classes", type_="unique")
