"""add endpoint_marker_* columns to users

Revision ID: ff6a7b8c9d0e
Revises: ee5f6a7b8c9d
Create Date: 2026-05-28

The endpoint marker (P*) display preferences move from localStorage-only to
server-side persistence so the player's choice (star / gorilla / custom image
+ hit-FX style) follows them across devices. All columns are nullable and
have no server default — legacy rows stay valid, and a NULL means the FE
should use its local default.

Defense-in-depth: the route-level Pydantic schema and the User aggregate both
re-check the allowlist; the CheckConstraints below are the final backstop.
"""
from alembic import op
import sqlalchemy as sa


revision = "ff6a7b8c9d0e"
down_revision = "ee5f6a7b8c9d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("endpoint_marker_style", sa.String(length=16), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("endpoint_marker_custom_dataurl", sa.Text(), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("endpoint_hit_fx", sa.String(length=16), nullable=True),
    )
    op.create_check_constraint(
        "ck_user_endpoint_marker_style",
        "users",
        "endpoint_marker_style IS NULL OR endpoint_marker_style IN "
        "('star', 'gorilla', 'custom')",
    )
    op.create_check_constraint(
        "ck_user_endpoint_hit_fx",
        "users",
        "endpoint_hit_fx IS NULL OR endpoint_hit_fx IN "
        "('random', 'fragments', 'crying', 'angry')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_user_endpoint_hit_fx", "users", type_="check")
    op.drop_constraint("ck_user_endpoint_marker_style", "users", type_="check")
    op.drop_column("users", "endpoint_hit_fx")
    op.drop_column("users", "endpoint_marker_custom_dataurl")
    op.drop_column("users", "endpoint_marker_style")
