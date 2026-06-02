"""add profile_initials_* columns to users

Revision ID: e2c3d4f5a6b7
Revises: d1a2b3c4e5f6
Create Date: 2026-06-02

The "initials + colour" avatar moves from localStorage-only to server-side
persistence. Two accounts signed in on the same browser previously shared the
single global localStorage key (mdf.profileInitials) so a change to account
A's avatar overwrote account B's. Storing the pair on the user row makes the
choice per-user by construction and follows the player across devices.

Both columns are nullable but must be set or cleared together — the aggregate
enforces this pairing and the CheckConstraint here is the DB backstop.
"""
from alembic import op
import sqlalchemy as sa


revision = "e2c3d4f5a6b7"
down_revision = "d1a2b3c4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("profile_initials_letters", sa.String(length=2), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("profile_initials_color", sa.String(length=7), nullable=True),
    )
    op.create_check_constraint(
        "ck_user_profile_initials_paired",
        "users",
        "(profile_initials_letters IS NULL AND profile_initials_color IS NULL) OR "
        "(profile_initials_letters IS NOT NULL AND profile_initials_color IS NOT NULL "
        " AND length(profile_initials_letters) BETWEEN 1 AND 2 "
        " AND profile_initials_color LIKE '#______')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_user_profile_initials_paired", "users", type_="check")
    op.drop_column("users", "profile_initials_color")
    op.drop_column("users", "profile_initials_letters")
