"""add practice_mode column on game_sessions

Revision ID: q1f2a3b4c5d6
Revises: p0e1f2a3b4c5
Create Date: 2026-05-08

Spec: docs/Pedagogical_Backlog_Spec.md §20 (Slider-Fallback Toggle for
Dyscalculic / High-Anxiety Learners). When set, the run is opt-in practice
mode and is excluded from the global leaderboard. Achievements and talent
points still award.
"""
import sqlalchemy as sa
from alembic import op

revision = "q1f2a3b4c5d6"
down_revision = "p0e1f2a3b4c5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_sessions",
        sa.Column(
            "practice_mode",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("game_sessions", "practice_mode")
