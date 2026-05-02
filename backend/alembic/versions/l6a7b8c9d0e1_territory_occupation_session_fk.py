"""add FK on territory_occupations.session_id

Revision ID: l6a7b8c9d0e1
Revises: k5f6a7b8c9d0
Create Date: 2026-05-02

B-H-7: territory_occupations.session_id previously had no foreign key to
game_sessions.  This adds the FK with SET NULL on session delete.
No separate index is needed: the existing unique constraint
(uq_territory_occupation_session) already creates an implicit B-tree index.
"""
import sqlalchemy as sa
from alembic import op

revision = "l6a7b8c9d0e1"
down_revision = "k5f6a7b8c9d0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_foreign_key(
        "fk_territory_occupations_session_id",
        "territory_occupations",
        "game_sessions",
        ["session_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_territory_occupations_session_id",
        "territory_occupations",
        type_="foreignkey",
    )
