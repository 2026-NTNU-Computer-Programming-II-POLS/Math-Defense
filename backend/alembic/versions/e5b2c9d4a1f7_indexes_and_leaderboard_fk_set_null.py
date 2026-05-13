"""Indexes and leaderboard FK SET NULL

Revision ID: e5b2c9d4a1f7
Revises: c3f9d2e1a8b4
Create Date: 2026-04-24 00:00:00.000000

BE-08: index on leaderboard_entries.created_at (tiebreaker sort)
BE-09: leaderboard_entries.user_id -> SET NULL so scores survive user deletion
BE-10: index on login_attempts.locked_until (janitor purge scan)
"""
from typing import Sequence, Union

from alembic import op


revision: str = 'e5b2c9d4a1f7'
down_revision: Union[str, None] = 'c3f9d2e1a8b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # BE-08: index for created_at tiebreaker on leaderboard queries
    op.create_index('ix_leaderboard_created_at', 'leaderboard_entries', ['created_at'])

    # BE-09: preserve leaderboard history when a user is deleted
    op.drop_constraint('leaderboard_entries_user_id_fkey', 'leaderboard_entries', type_='foreignkey')
    op.alter_column('leaderboard_entries', 'user_id', nullable=True)
    op.create_foreign_key(
        'leaderboard_entries_user_id_fkey',
        'leaderboard_entries', 'users',
        ['user_id'], ['id'],
        ondelete='SET NULL',
    )

    # BE-10: index for janitor purge scan on locked_until
    op.create_index('ix_login_attempts_locked_until', 'login_attempts', ['locked_until'])


def downgrade() -> None:
    op.drop_index('ix_login_attempts_locked_until', table_name='login_attempts')

    op.drop_constraint('leaderboard_entries_user_id_fkey', 'leaderboard_entries', type_='foreignkey')
    op.alter_column('leaderboard_entries', 'user_id', nullable=False)
    op.create_foreign_key(
        'leaderboard_entries_user_id_fkey',
        'leaderboard_entries', 'users',
        ['user_id'], ['id'],
        ondelete='CASCADE',
    )

    op.drop_index('ix_leaderboard_created_at', table_name='leaderboard_entries')
