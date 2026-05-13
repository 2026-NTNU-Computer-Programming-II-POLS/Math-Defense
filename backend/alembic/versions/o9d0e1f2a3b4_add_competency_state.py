"""add user_competency_state table

Revision ID: o9d0e1f2a3b4
Revises: n8c9d0e1f2a3
Create Date: 2026-05-07

Spec: docs/Pedagogical_Backlog_Spec.md §8 (Bayesian Competency Estimator).
Stores per-(user, competency) Beta posteriors so stealth-assessment evidence
accumulated over sessions persists across logins and is loadable in a single
SELECT for the dashboard.
"""
import sqlalchemy as sa
from alembic import op

revision = "o9d0e1f2a3b4"
down_revision = "n8c9d0e1f2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_competency_state",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("competency", sa.String(length=32), nullable=False),
        sa.Column("alpha", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("beta", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("CURRENT_TIMESTAMP"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "competency"),
    )


def downgrade() -> None:
    op.drop_table("user_competency_state")
