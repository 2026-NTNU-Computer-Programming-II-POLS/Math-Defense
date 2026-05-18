"""Fix H-06, H-07, H-10, M-02: FK index, server-side onupdate triggers, NOT NULL constraints, leaderboard total_score

Revision ID: b2_fix_h06_h07_h10
Revises: a1_widen_totp
Create Date: 2026-05-18

H-06: Add index on game_sessions.challenge_id for FK queries and cascades.
H-07: Add PostgreSQL UPDATE triggers to set updated_at = CURRENT_TIMESTAMP on users, talent_allocations, user_competency_state.
H-10: Add NOT NULL constraints to required columns in game_sessions (status, current_wave, gold, hp, score).
M-02: Add total_score column to leaderboard_entries for V2 floating-point scores.
"""
from alembic import op
import sqlalchemy as sa


revision = "b2_fix_h06_h07_h10"
down_revision = "a1_widen_totp"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # M-02: Add total_score column to leaderboard_entries for V2 scores
    op.add_column(
        "leaderboard_entries",
        sa.Column("total_score", sa.Float(), nullable=True),
    )

    # H-06: Add index on challenge_id
    op.create_index(
        "ix_game_sessions_challenge_id",
        "game_sessions",
        ["challenge_id"],
    )

    # H-10: Add NOT NULL constraints to required game_sessions columns
    op.alter_column(
        "game_sessions",
        "status",
        existing_type=sa.String(),
        nullable=False,
        existing_nullable=True,
    )
    op.alter_column(
        "game_sessions",
        "current_wave",
        existing_type=sa.Integer(),
        nullable=False,
        existing_nullable=True,
    )
    op.alter_column(
        "game_sessions",
        "gold",
        existing_type=sa.Integer(),
        nullable=False,
        existing_nullable=True,
    )
    op.alter_column(
        "game_sessions",
        "hp",
        existing_type=sa.Integer(),
        nullable=False,
        existing_nullable=True,
    )
    op.alter_column(
        "game_sessions",
        "score",
        existing_type=sa.Integer(),
        nullable=False,
        existing_nullable=True,
    )

    # H-07: Create UPDATE triggers for updated_at columns
    # Trigger for users.updated_at
    op.execute("""
        CREATE OR REPLACE FUNCTION update_users_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS users_update_timestamp ON users;
        CREATE TRIGGER users_update_timestamp
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_users_updated_at();
    """)

    # Trigger for talent_allocations.updated_at
    op.execute("""
        CREATE OR REPLACE FUNCTION update_talent_allocations_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS talent_allocations_update_timestamp ON talent_allocations;
        CREATE TRIGGER talent_allocations_update_timestamp
        BEFORE UPDATE ON talent_allocations
        FOR EACH ROW
        EXECUTE FUNCTION update_talent_allocations_updated_at();
    """)

    # Trigger for user_competency_state.updated_at
    op.execute("""
        CREATE OR REPLACE FUNCTION update_user_competency_state_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = CURRENT_TIMESTAMP;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)
    op.execute("""
        DROP TRIGGER IF EXISTS user_competency_state_update_timestamp ON user_competency_state;
        CREATE TRIGGER user_competency_state_update_timestamp
        BEFORE UPDATE ON user_competency_state
        FOR EACH ROW
        EXECUTE FUNCTION update_user_competency_state_updated_at();
    """)


def downgrade() -> None:
    # Remove M-02 total_score column
    op.drop_column("leaderboard_entries", "total_score")

    # Remove triggers
    op.execute("DROP TRIGGER IF EXISTS user_competency_state_update_timestamp ON user_competency_state;")
    op.execute("DROP FUNCTION IF EXISTS update_user_competency_state_updated_at();")
    op.execute("DROP TRIGGER IF EXISTS talent_allocations_update_timestamp ON talent_allocations;")
    op.execute("DROP FUNCTION IF EXISTS update_talent_allocations_updated_at();")
    op.execute("DROP TRIGGER IF EXISTS users_update_timestamp ON users;")
    op.execute("DROP FUNCTION IF EXISTS update_users_updated_at();")

    # Remove NOT NULL constraints from game_sessions
    op.alter_column(
        "game_sessions",
        "score",
        existing_type=sa.Integer(),
        nullable=True,
        existing_nullable=False,
    )
    op.alter_column(
        "game_sessions",
        "hp",
        existing_type=sa.Integer(),
        nullable=True,
        existing_nullable=False,
    )
    op.alter_column(
        "game_sessions",
        "gold",
        existing_type=sa.Integer(),
        nullable=True,
        existing_nullable=False,
    )
    op.alter_column(
        "game_sessions",
        "current_wave",
        existing_type=sa.Integer(),
        nullable=True,
        existing_nullable=False,
    )
    op.alter_column(
        "game_sessions",
        "status",
        existing_type=sa.String(),
        nullable=True,
        existing_nullable=False,
    )

    # Remove index
    op.drop_index("ix_game_sessions_challenge_id", table_name="game_sessions")
