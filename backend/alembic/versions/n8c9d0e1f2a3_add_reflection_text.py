"""add reflection_text column to game_sessions

Revision ID: n8c9d0e1f2a3
Revises: m7b8c9d0e1f2
Create Date: 2026-05-07

Spec: docs/Pedagogical_Backlog_Spec.md §2 (Articulation Prompt).
Backs the post-wave free-text reflection submitted from ScoreResultView and
surfaced to teachers for class-mode sessions.
"""
import sqlalchemy as sa
from alembic import op

revision = "n8c9d0e1f2a3"
down_revision = "m7b8c9d0e1f2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_sessions",
        sa.Column("reflection_text", sa.String(length=2000), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("game_sessions", "reflection_text")
