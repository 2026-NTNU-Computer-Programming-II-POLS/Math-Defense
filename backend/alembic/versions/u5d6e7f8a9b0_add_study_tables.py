"""add study enrollment, probe, and affect tables

Revision ID: u5d6e7f8a9b0
Revises: t4c5d6e7f8a9
Create Date: 2026-05-08

Spec: docs/Pedagogical_Backlog_Spec.md §27 (Empirical Validity Probe).

Three tables land together because the export endpoint joins all three
to produce one CSV row per participant: enrollment captures the cached
group + dosage; probe attempts capture the pre/post/delay scores; affect
responses capture the anxiety_pre / anxiety_post Likert means.
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "u5d6e7f8a9b0"
down_revision = "t4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "study_enrollments",
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("study_id", sa.String(length=64), primary_key=True),
        sa.Column("group", sa.String(length=1), nullable=False),
        sa.Column(
            "dosage_seconds",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
        sa.Column(
            "enrolled_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "user_id", "study_id", name="uq_study_enrollment",
        ),
    )

    op.create_table(
        "study_probe_attempts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("study_id", sa.String(length=64), nullable=False),
        sa.Column("form", sa.String(length=8), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("responses", JSONB(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "user_id", "study_id", "form", name="uq_study_probe_form",
        ),
    )

    op.create_table(
        "study_affect_responses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("study_id", sa.String(length=64), nullable=False),
        sa.Column("phase", sa.String(length=8), nullable=False),
        sa.Column("anxiety_mean", sa.Float(), nullable=False),
        sa.Column("motivation_mean", sa.Float(), nullable=False),
        sa.Column("responses", JSONB(), nullable=False),
        sa.Column(
            "submitted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "user_id", "study_id", "phase", name="uq_study_affect_phase",
        ),
    )


def downgrade() -> None:
    op.drop_table("study_affect_responses")
    op.drop_table("study_probe_attempts")
    op.drop_table("study_enrollments")
