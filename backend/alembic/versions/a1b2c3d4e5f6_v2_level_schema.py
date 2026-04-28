"""v2 level schema: replace level with star_rating, add path_config and IA fields

Revision ID: a1b2c3d4e5f6
Revises: f7a3b8c2d1e6
Create Date: 2026-04-28
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON

revision = "a1b2c3d4e5f6"
down_revision = "f7a3b8c2d1e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("game_sessions", sa.Column("star_rating", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("path_config", JSON(), nullable=True))
    op.add_column("game_sessions", sa.Column("initial_answer", sa.Boolean(), nullable=True, server_default="false"))
    op.add_column("game_sessions", sa.Column("time_total", sa.Float(), nullable=True))
    op.add_column("game_sessions", sa.Column("cost_total", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("health_origin", sa.Integer(), nullable=True))
    op.add_column("game_sessions", sa.Column("health_final", sa.Integer(), nullable=True))

    op.execute("UPDATE game_sessions SET star_rating = level WHERE star_rating IS NULL")
    op.alter_column("game_sessions", "star_rating", nullable=False)

    op.drop_constraint("ck_game_session_level_range", "game_sessions", type_="check")
    op.drop_column("game_sessions", "level")
    op.create_check_constraint(
        "ck_game_session_star_range", "game_sessions", "star_rating BETWEEN 1 AND 5"
    )

    op.drop_constraint("ck_leaderboard_level_range", "leaderboard_entries", type_="check")
    op.create_check_constraint(
        "ck_leaderboard_level_range", "leaderboard_entries", "level BETWEEN 1 AND 5"
    )


def downgrade() -> None:
    op.add_column("game_sessions", sa.Column("level", sa.Integer(), nullable=True))
    op.execute("UPDATE game_sessions SET level = LEAST(star_rating, 4)")
    op.alter_column("game_sessions", "level", nullable=False)

    op.drop_constraint("ck_game_session_star_range", "game_sessions", type_="check")
    op.drop_column("game_sessions", "star_rating")
    op.drop_column("game_sessions", "path_config")
    op.drop_column("game_sessions", "initial_answer")
    op.drop_column("game_sessions", "time_total")
    op.drop_column("game_sessions", "cost_total")
    op.drop_column("game_sessions", "health_origin")
    op.drop_column("game_sessions", "health_final")

    op.create_check_constraint(
        "ck_game_session_level_range", "game_sessions", "level BETWEEN 1 AND 4"
    )

    op.drop_constraint("ck_leaderboard_level_range", "leaderboard_entries", type_="check")
    op.create_check_constraint(
        "ck_leaderboard_level_range", "leaderboard_entries", "level BETWEEN 1 AND 4"
    )
