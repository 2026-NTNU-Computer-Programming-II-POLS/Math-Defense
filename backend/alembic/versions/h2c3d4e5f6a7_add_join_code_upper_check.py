"""add CHECK constraint join_code = upper(join_code)

Revision ID: h2c3d4e5f6a7
Revises: g1b2c3d4e5f6
Create Date: 2026-05-02
"""
from alembic import op

revision = "h2c3d4e5f6a7"
down_revision = "g1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE classes ADD CONSTRAINT ck_classes_join_code_upper "
        "CHECK (join_code = upper(join_code))"
    )


def downgrade() -> None:
    op.drop_constraint("ck_classes_join_code_upper", "classes", type_="check")
