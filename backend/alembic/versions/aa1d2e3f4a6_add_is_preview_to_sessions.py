"""add is_preview column on game_sessions

Revision ID: aa1d2e3f4a6
Revises: z0c1d2e3f4a5
Create Date: 2026-05-26

Server-derived flag: True when a non-student (teacher / admin) ran the
session, e.g. for previewing the game or smoke-testing. The leaderboard
insert handler skips preview runs so they never reach the public ranking
tables. Achievements and talent points still award — mirrors the
practice_mode escape hatch from §20.

Existing rows are backfilled to false (server_default), which is correct:
prior to this migration, only students could meaningfully create sessions
(the new gate is server-side on POST /api/sessions and operates only on
freshly-created rows).
"""
import sqlalchemy as sa
from alembic import op

revision = "aa1d2e3f4a6"
down_revision = "z0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "game_sessions",
        sa.Column(
            "is_preview",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("game_sessions", "is_preview")
