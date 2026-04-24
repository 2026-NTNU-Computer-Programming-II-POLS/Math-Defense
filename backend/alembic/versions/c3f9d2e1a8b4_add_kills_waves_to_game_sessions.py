"""Add kills and waves_survived to game_sessions

Revision ID: c3f9d2e1a8b4
Revises: b1f4e7a2c0d9
Create Date: 2026-04-24 00:00:00.000000

Stores final kills and waves_survived on the session row so the idempotency
catch-up path in SessionApplicationService.end_session can replay the
SessionCompleted event with authoritative values rather than relying on the
incoming request (BE-04).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c3f9d2e1a8b4'
down_revision: Union[str, None] = 'b1f4e7a2c0d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('game_sessions', sa.Column('kills', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('game_sessions', sa.Column('waves_survived', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('game_sessions', 'waves_survived')
    op.drop_column('game_sessions', 'kills')
