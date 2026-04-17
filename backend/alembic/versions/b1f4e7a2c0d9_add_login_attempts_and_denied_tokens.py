"""Add login_attempts and denied_tokens tables

Revision ID: b1f4e7a2c0d9
Revises: aec17830bec5
Create Date: 2026-04-17 00:00:00.000000

Moves auth security state (failed-login lockouts and JWT revocations) off of
per-process in-memory dicts so they survive restarts and propagate across
replicas. See SECURITY_AUDIT_AUTH.md H2/H3.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b1f4e7a2c0d9'
down_revision: Union[str, None] = 'aec17830bec5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'login_attempts',
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('failures', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('window_started_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('username'),
    )
    op.create_table(
        'denied_tokens',
        sa.Column('jti', sa.String(length=64), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('jti'),
    )
    op.create_index('ix_denied_tokens_expires_at', 'denied_tokens', ['expires_at'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_denied_tokens_expires_at', table_name='denied_tokens')
    op.drop_table('denied_tokens')
    op.drop_table('login_attempts')
