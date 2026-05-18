"""Widen totp_secret column for Fernet ciphertext (H-01)

Revision ID: a1_widen_totp
Revises: z0c1d2e3f4a5
Create Date: 2026-05-18

Fernet-encrypted TOTP secrets are ~120 chars; the old String(64) is too narrow.
"""
from alembic import op
import sqlalchemy as sa


revision = "a1_widen_totp"
down_revision = "z0c1d2e3f4a5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "users",
        "totp_secret",
        existing_type=sa.String(64),
        type_=sa.String(255),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "totp_secret",
        existing_type=sa.String(255),
        type_=sa.String(64),
        existing_nullable=True,
    )
