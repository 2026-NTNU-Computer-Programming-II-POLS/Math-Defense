"""tighten territory_slots.slot_index CHECK to 0..49

Revision ID: dd4e5f6a7b8c
Revises: cc3d4e5f6a8b
Create Date: 2026-05-28

The Pydantic CreateActivityRequest schema caps slots at max_length=50, but the
DB only enforces slot_index >= 0. Combined with the existing
UNIQUE(activity_id, slot_index) constraint and the application's sequential
0-based slot_index assignment, tightening the range to BETWEEN 0 AND 49 caps
the per-activity slot count at 50 at the DB layer too, so any path that
bypasses the application service can't exceed the limit.
"""
from alembic import op


revision = "dd4e5f6a7b8c"
down_revision = "cc3d4e5f6a8b"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(
        "ck_territory_slot_index_nonneg", "territory_slots", type_="check",
    )
    op.create_check_constraint(
        "ck_territory_slot_index_range",
        "territory_slots",
        "slot_index BETWEEN 0 AND 49",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_territory_slot_index_range", "territory_slots", type_="check",
    )
    op.create_check_constraint(
        "ck_territory_slot_index_nonneg",
        "territory_slots",
        "slot_index >= 0",
    )
