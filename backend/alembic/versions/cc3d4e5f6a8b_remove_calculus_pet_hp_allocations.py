"""remove calculus_pet_hp talent allocations

Revision ID: cc3d4e5f6a8b
Revises: bb2c3d4e5f7a
Create Date: 2026-05-27

Balance Overhaul Phase 4 (Q10) replaces the unused `calculus_pet_hp` talent
with `calculus_pet_range`. Existing allocations to `calculus_pet_hp` are
orphaned the moment the node disappears from the registry; this revision
deletes those rows so the registry and the persisted state agree again.

Spent-TP recovery is automatic: `achievement_service.compute_remaining_talent_points`
derives spent TP as `sum(achievement_points) - sum(allocations)`, so dropping
the rows naturally returns the points to the player. No application-level
refund is needed.
"""
from alembic import op


revision = "cc3d4e5f6a8b"
down_revision = "bb2c3d4e5f7a"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("DELETE FROM talent_allocations WHERE talent_node_id = 'calculus_pet_hp'")


def downgrade() -> None:
    # Allocation history is not restorable — the source rows are gone. Spent
    # TP for the previous holders will simply read as available again on the
    # next request, which is the intended end state.
    pass
