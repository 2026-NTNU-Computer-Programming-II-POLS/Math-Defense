"""add ia_recent_accuracy column on users

Revision ID: p0e1f2a3b4c5
Revises: o9d0e1f2a3b4
Create Date: 2026-05-08

Spec: docs/Pedagogical_Backlog_Spec.md §17 (Concrete-Fading on Path Rendering).
Stores the user's rolling Initial-Answer accuracy over the last 10 completed
sessions so the Star-1 path renderer can fade y-axis labels as the player
internalises the abstract representation (Goldstone & Son 2005).
"""
import sqlalchemy as sa
from alembic import op

revision = "p0e1f2a3b4c5"
down_revision = "o9d0e1f2a3b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "ia_recent_accuracy",
            sa.Float(),
            nullable=False,
            server_default="0.0",
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "ia_recent_accuracy")
