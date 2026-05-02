"""add session_id to territory_occupations for session replay prevention

Revision ID: g1b2c3d4e5f6
Revises: f0a1b2c3d4e5
Create Date: 2026-05-01
"""
from alembic import op
import sqlalchemy as sa

revision = "g1b2c3d4e5f6"
down_revision = "f0a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "territory_occupations",
        sa.Column("session_id", sa.String(), nullable=True),
    )
    op.create_unique_constraint(
        "uq_territory_occupation_session",
        "territory_occupations",
        ["session_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_territory_occupation_session", "territory_occupations", type_="unique")
    op.drop_column("territory_occupations", "session_id")
