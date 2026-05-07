"""add seasons table (merges divergent heads q1f2a3b4c5d6 and a3b4c5d6e7f8)

Revision ID: r2a3b4c5d6e7
Revises: q1f2a3b4c5d6, a3b4c5d6e7f8
Create Date: 2026-05-08

Spec: docs/Pedagogical_Backlog_Spec.md §22 (Seasonal Achievement Sets).
Admins / teachers promote a set of achievements as a time-bounded "season"
that doubles the talent-point award while active. Definitions in code carry
the membership tag (`season_id`); this table holds the runtime window.

The auth-branch head ``a3b4c5d6e7f8`` (lockout_count) and the gameplay-branch
head ``q1f2a3b4c5d6`` (practice_mode) had been left as siblings — Alembic's
``upgrade head`` cannot resolve them. This revision merges both so the next
boot's lifespan call succeeds.
"""
import sqlalchemy as sa
from alembic import op

revision = "r2a3b4c5d6e7"
down_revision = ("q1f2a3b4c5d6", "a3b4c5d6e7f8")
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "seasons",
        sa.Column("season_id", sa.String(length=64), primary_key=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint("ends_at > starts_at", name="ck_seasons_window"),
    )


def downgrade() -> None:
    op.drop_table("seasons")
