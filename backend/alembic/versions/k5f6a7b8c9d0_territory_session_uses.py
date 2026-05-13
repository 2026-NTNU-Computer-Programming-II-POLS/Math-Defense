"""add territory_session_uses for durable session-replay prevention

Revision ID: k5f6a7b8c9d0
Revises: j4e5f6a7b8c9
Create Date: 2026-05-02

B-C-2: territory_session_uses keeps a permanent record of every session_id
consumed for a territory capture.  The previous approach tracked usage only
inside territory_occupations, so deleting a displaced occupation erased the
record and allowed the displaced student to replay the same session.
"""
import sqlalchemy as sa
from alembic import op

revision = "k5f6a7b8c9d0"
down_revision = "j4e5f6a7b8c9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "territory_session_uses",
        sa.Column("session_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("session_id", name="pk_territory_session_uses"),
    )


def downgrade() -> None:
    op.drop_table("territory_session_uses")
