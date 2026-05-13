"""v2 session scoring fields: time_exclude_prepare, initial_answer propagation

Revision ID: e6f7a8b9c0d1
Revises: d4e5f6a7b8c9
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "e6f7a8b9c0d1"
down_revision = "d4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_sessions",
        sa.Column("time_exclude_prepare", JSON, nullable=True),
    )
    op.add_column(
        "game_sessions",
        sa.Column("total_score", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("game_sessions", "total_score")
    op.drop_column("game_sessions", "time_exclude_prepare")
