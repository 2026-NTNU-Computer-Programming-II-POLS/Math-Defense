"""add challenges table and challenge_id columns

Revision ID: s3b4c5d6e7f8
Revises: r2a3b4c5d6e7
Create Date: 2026-05-08

Spec: docs/Pedagogical_Backlog_Spec.md §23 (Generative Challenge Mode).
Adds the ``challenges`` table that stores teacher-authored constraint
surfaces, plus nullable ``challenge_id`` foreign keys on ``game_sessions``
and ``leaderboard_entries`` so a session can be tagged with the challenge
it originated from and queries can filter rankings to a single challenge.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "s3b4c5d6e7f8"
down_revision = "r2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "challenges",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "teacher_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column(
            "description", sa.String(length=500), nullable=False, server_default=""
        ),
        sa.Column("constraints", JSONB(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_challenges_teacher_id", "challenges", ["teacher_id"])
    op.create_index("ix_challenges_created_at", "challenges", ["created_at"])

    op.add_column(
        "game_sessions",
        sa.Column("challenge_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_game_sessions_challenge_id",
        "game_sessions",
        "challenges",
        ["challenge_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.add_column(
        "leaderboard_entries",
        sa.Column("challenge_id", sa.String(), nullable=True),
    )
    op.create_foreign_key(
        "fk_leaderboard_entries_challenge_id",
        "leaderboard_entries",
        "challenges",
        ["challenge_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_leaderboard_challenge_id",
        "leaderboard_entries",
        ["challenge_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_leaderboard_challenge_id", table_name="leaderboard_entries")
    op.drop_constraint(
        "fk_leaderboard_entries_challenge_id",
        "leaderboard_entries",
        type_="foreignkey",
    )
    op.drop_column("leaderboard_entries", "challenge_id")
    op.drop_constraint(
        "fk_game_sessions_challenge_id",
        "game_sessions",
        type_="foreignkey",
    )
    op.drop_column("game_sessions", "challenge_id")
    op.drop_index("ix_challenges_created_at", table_name="challenges")
    op.drop_index("ix_challenges_teacher_id", table_name="challenges")
    op.drop_table("challenges")
