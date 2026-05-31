"""drop avatar_url from users

Revision ID: d1a2b3c4e5f6
Revises: ff6a7b8c9d0e
Create Date: 2026-05-31

The preset-SVG avatar feature was removed: the avatar is now a client-side
"initials + colour" badge persisted in localStorage only (mdf.profileInitials),
so the server no longer stores or serves an avatar. This drops the now-unused
column. Downgrade re-adds it as a nullable String(500), matching the original
definition in f7a3b8c2d1e6_v2_foundation.
"""
from alembic import op
import sqlalchemy as sa


revision = "d1a2b3c4e5f6"
down_revision = "ff6a7b8c9d0e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("users", "avatar_url")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
    )
