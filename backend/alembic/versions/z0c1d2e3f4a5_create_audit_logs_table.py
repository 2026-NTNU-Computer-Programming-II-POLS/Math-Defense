"""create audit_logs table

Revision ID: z0c1d2e3f4a5
Revises: y9b0c1d2e3f4
Create Date: 2026-05-18

C-01: The AuditLog ORM model and infrastructure/audit_logger.py existed but no
migration ever created the table.  Every record_audit_event() call silently
failed (exception swallowed).  This migration closes the gap so the security
audit trail actually persists.

user_id intentionally has NO FK to users.id — audit records must survive user
deletion for forensic purposes.
"""
from alembic import op
import sqlalchemy as sa


revision = "z0c1d2e3f4a5"
down_revision = "y9b0c1d2e3f4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), nullable=True),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text, nullable=True),
        sa.Column("details", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_audit_logs_user_id_created_at",
        "audit_logs",
        ["user_id", "created_at"],
    )
    op.create_index(
        "ix_audit_logs_event_type_created_at",
        "audit_logs",
        ["event_type", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_audit_logs_event_type_created_at", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id_created_at", table_name="audit_logs")
    op.drop_table("audit_logs")
