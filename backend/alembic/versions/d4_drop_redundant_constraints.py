"""L-21/L-22: Drop redundant index and unique constraint

Revision ID: d4_drop_redundant_constraints
Revises: c3_add_check_constraints
Create Date: 2026-05-18

L-21: ix_territory_occupations_slot_id is redundant — the unique constraint
      uq_territory_occupation_slot already creates a B-tree index.
L-22: uq_study_enrollment is redundant — the composite PK (user_id, study_id)
      already enforces uniqueness.
"""
from alembic import op

revision = "d4_drop_redundant_constraints"
down_revision = "c3_add_check_constraints"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("ix_territory_occupations_slot_id", table_name="territory_occupations")
    op.drop_constraint("uq_study_enrollment", "study_enrollments", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("uq_study_enrollment", "study_enrollments", ["user_id", "study_id"])
    op.create_index("ix_territory_occupations_slot_id", "territory_occupations", ["slot_id"])
